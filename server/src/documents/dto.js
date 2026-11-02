// Admin-facing shape. objectKey is deliberately never included.
export const adminDto = (d) => ({
  id: String(d._id), title: d.title, description: d.description,
  subject: d.subject?.name ? { id: String(d.subject._id), name: d.subject.name } : d.subject ? { id: String(d.subject) } : null,
  semester: d.semester ?? null, fileType: d.fileType, mimeType: d.mimeType, fileSize: d.fileSize,
  academicCategory: d.academicCategory ?? 'legacy', academicYear: d.academicYear ?? null,
  branch: d.branch ?? null, standard: d.standard ?? null, course: d.course ?? null,
  materialType: d.materialType ?? 'study-notes',
  pageCount: d.pageCount ?? null, width: d.width ?? null, height: d.height ?? null,
  processingStatus: d.processingStatus, publicationStatus: d.publicationStatus,
  failureReason: d.failureReason ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt,
});
