import crypto from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import { ACADEMIC_CATEGORIES, ENGINEERING_BRANCHES, MATERIAL_TYPES } from '../models/Document.js';
import { countPdfPages } from './pdfInspect.js';
import { imageSize } from 'image-size';
import { httpError } from '../middleware/auth.js';

const TYPES = {
  pdf: { ext: ['.pdf'], mime: 'application/pdf', fileType: 'pdf', keyExt: 'pdf' },
  jpeg: { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', fileType: 'image', keyExt: 'jpg' },
  png: { ext: ['.png'], mime: 'image/png', fileType: 'image', keyExt: 'png' },
  webp: { ext: ['.webp'], mime: 'image/webp', fileType: 'image', keyExt: 'webp' },
};

// Detect type from the actual bytes (magic numbers), never from filename or client MIME.
export function sniff(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const unsupported = (msg) => httpError(415, 'UNSUPPORTED_FILE', msg);

export async function inspectFile(file, config) {
  if (!file?.buffer?.length) throw httpError(400, 'VALIDATION', 'A non-empty file is required.');
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (!Object.values(TYPES).some((t) => t.ext.includes(ext))) throw unsupported('Allowed file types: PDF, JPEG, PNG, WebP.');
  const kind = sniff(file.buffer);
  if (!kind) throw unsupported('File content is not a valid PDF, JPEG, PNG or WebP.');
  const t = TYPES[kind];
  if (!t.ext.includes(ext)) throw unsupported('File extension does not match its content.');
  if (file.mimetype !== t.mime) throw unsupported('Declared file type does not match its content.');

  const info = { kind, ...t, fileSize: file.buffer.length, pageCount: null, width: null, height: null };
  if (kind === 'pdf') {
    try { info.pageCount = await countPdfPages(file.buffer, config.pdfParseTimeoutMs); } catch (e) {
      if (e.reason === 'timeout' || e.reason === 'resources') throw httpError(422, 'INVALID_FILE', 'The PDF took too long or too many resources to process, so it was rejected.');
      throw httpError(422, 'INVALID_FILE', 'The PDF could not be read (it may be corrupt or password-protected).');
    }
    if (info.pageCount < 1 || info.pageCount > config.maxPdfPages) {
      throw httpError(422, 'INVALID_FILE', `PDFs may have at most ${config.maxPdfPages} pages.`);
    }
  } else {
    let dim;
    try { dim = imageSize(file.buffer); } catch { throw httpError(422, 'INVALID_FILE', 'The image could not be read.'); }
    if (!dim?.width || !dim?.height) throw httpError(422, 'INVALID_FILE', 'The image could not be read.');
    if ((dim.width * dim.height) / 1e6 > config.maxImageMegapixels || Math.max(dim.width, dim.height) > 12000) {
      throw httpError(422, 'INVALID_FILE', `Images may be at most ${config.maxImageMegapixels} megapixels.`);
    }
    info.width = dim.width; info.height = dim.height;
  }
  return info;
}

// Keys are 100% server-generated: no filename, MIME, or user text is ever part of them.
export const makeObjectKey = (docId, keyExt) =>
  `campuspages/documents/${docId}/${crypto.randomBytes(12).toString('hex')}.${keyExt}`;

export const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v) && mongoose.isValidObjectId(v);
const bad = (m) => httpError(400, 'VALIDATION', m);

// Strict allow-list: unknown keys are rejected (prevents mass assignment of status/objectKey/etc.).
export function validateMetadata(body, { partial = false } = {}) {
  const allowed = ['title', 'description', 'subjectId', 'semester', 'academicCategory', 'academicYear', 'branch', 'standard', 'course', 'materialType'];
  const extra = Object.keys(body ?? {}).filter((k) => !allowed.includes(k));
  if (extra.length) throw bad(`Unknown field: ${extra[0]}`);
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) throw bad('Title is required (max 200 characters).');
    out.title = body.title.trim();
  }
  if (has('description')) {
    if (typeof body.description !== 'string' || body.description.length > 2000) throw bad('Description must be at most 2000 characters.');
    out.description = body.description.trim();
  }
  if (!partial || has('subjectId')) {
    if (!isObjectId(body.subjectId)) throw bad('A valid subject is required.');
    out.subject = body.subjectId;
  }
  if (has('semester')) {
    if (body.semester === '' || body.semester === null) out.semester = null;
    else {
      const n = Number(body.semester);
      if (!Number.isInteger(n) || n < 1 || n > 12) throw bad('Semester must be a whole number from 1 to 12.');
      out.semester = n;
    }
  }
  if (!partial || has('academicCategory')) {
    const category = body.academicCategory ?? (partial ? undefined : 'legacy');
    if (category !== undefined) {
      if (!ACADEMIC_CATEGORIES.includes(category)) throw bad('Choose Engineering or Other Standards.');
      out.academicCategory = category;
    }
  }
  if (!partial || has('academicYear')) {
    if (body.academicYear === '' || body.academicYear === null || body.academicYear === undefined) {
      if (has('academicYear')) out.academicYear = null;
    } else {
      const n = Number(body.academicYear);
      if (!Number.isInteger(n) || n < 1 || n > 4) throw bad('Academic year must be from 1 to 4.');
      out.academicYear = n;
    }
  }
  if (!partial || has('branch')) {
    if (body.branch === '' || body.branch === null || body.branch === undefined) {
      if (has('branch')) out.branch = null;
    } else {
      if (!ENGINEERING_BRANCHES.includes(body.branch)) throw bad('Choose a valid engineering branch.');
      out.branch = body.branch;
    }
  }
  for (const field of ['standard', 'course']) {
    if (has(field)) {
      const value = typeof body[field] === 'string' ? body[field].trim() : '';
      const max = field === 'standard' ? 100 : 120;
      if (value.length > max) throw bad(`${field === 'standard' ? 'Standard or class' : 'Course'} must be at most ${max} characters.`);
      out[field] = value || null;
    }
  }
  if (!partial || has('materialType')) {
    const type = body.materialType ?? (partial ? undefined : 'study-notes');
    if (type !== undefined) {
      if (!MATERIAL_TYPES.includes(type)) throw bad('Choose a valid material type.');
      out.materialType = type;
    }
  }
  const category = out.academicCategory;
  if (category === 'engineering') {
    const year = out.academicYear;
    const branch = out.branch;
    if ((!partial || category !== undefined || year !== undefined || branch !== undefined) &&
        ((year === undefined && !partial) || (branch === undefined && !partial) || year === null || branch === null)) {
      throw bad('Engineering materials require an academic year and branch.');
    }
    if (out.semester && year && (out.semester < (year - 1) * 2 + 1 || out.semester > year * 2)) throw bad('Semester must match the selected academic year.');
    if (has('standard')) out.standard = null;
    if (has('course')) out.course = null;
  }
  if (category === 'other' && (!partial || has('academicCategory') || has('standard')) &&
      !(out.standard ?? (partial ? undefined : null))) throw bad('Other Standards materials require a standard or class.');
  return out;
}
