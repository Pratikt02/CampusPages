import mongoose from 'mongoose';

export const PROCESSING = ['uploading', 'processing', 'ready', 'failed'];
export const PUBLICATION = ['draft', 'published'];
export const ACADEMIC_CATEGORIES = ['engineering', 'other', 'legacy'];
export const ENGINEERING_BRANCHES = ['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'];
export const MATERIAL_TYPES = ['study-notes', 'previous-year-question-paper', 'practical-file', 'lab-manual', 'syllabus'];

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  semester: { type: Number, min: 1, max: 12, default: null },
  academicCategory: { type: String, enum: ACADEMIC_CATEGORIES, default: 'legacy', index: true },
  academicYear: { type: Number, min: 1, max: 4, default: null },
  branch: { type: String, enum: ENGINEERING_BRANCHES, default: null },
  standard: { type: String, trim: true, maxlength: 100, default: null },
  course: { type: String, trim: true, maxlength: 120, default: null },
  materialType: { type: String, enum: MATERIAL_TYPES, default: 'study-notes' },
  duplicateKey: { type: String, select: false, unique: true, sparse: true },
  fileType: { type: String, enum: ['pdf', 'image'], required: true },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], required: true },
  objectKey: { type: String, required: true, select: false }, // private; never serialized to clients
  orphanedObjectKeys: { type: [String], default: [], select: false }, // prior verified files awaiting a retryable cleanup
  fileSize: { type: Number, required: true, min: 1 },
  pageCount: { type: Number, min: 1, default: null },
  width: { type: Number, min: 1, default: null },
  height: { type: Number, min: 1, default: null },
  processingStatus: { type: String, enum: PROCESSING, default: 'uploading', required: true },
  publicationStatus: { type: String, enum: PUBLICATION, default: 'draft', required: true },
  failureReason: { type: String, maxlength: 60, default: null },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Invariant: nothing unfinished can ever be published.
schema.pre('validate', function check(next) {
  if (this.publicationStatus === 'published' && this.processingStatus !== 'ready') {
    return next(new Error('Only fully processed documents can be published'));
  }
  next();
});
schema.index({ publicationStatus: 1, subject: 1, createdAt: -1 });
schema.index({ publicationStatus: 1, academicCategory: 1, academicYear: 1, branch: 1, semester: 1, createdAt: -1 });
schema.index({ processingStatus: 1, createdAt: 1 });
schema.index({ title: 'text', description: 'text' });
export const Document = mongoose.models.Document || mongoose.model('Document', schema);
