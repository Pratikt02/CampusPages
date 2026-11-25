import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  x: { type: Number, min: 0, max: 1, required: true },
  y: { type: Number, min: 0, max: 1, required: true },
}, { _id: false });

const strokeSchema = new mongoose.Schema({
  tool: { type: String, enum: ['pencil', 'highlighter', 'tick'], required: true },
  color: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
  width: { type: Number, min: 0.001, max: 0.04, required: true },
  points: { type: [pointSchema], required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  page: { type: Number, required: true, min: 1 },
  strokes: { type: [strokeSchema], required: true, maxlength: 500 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ user: 1, document: 1, page: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Annotation = mongoose.models.Annotation || mongoose.model('Annotation', schema);
