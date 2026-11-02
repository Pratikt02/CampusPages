import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80, unique: true },
  slug: { type: String, required: true, unique: true, lowercase: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  order: { type: Number, default: 0 },
}, { timestamps: true });
export const Subject = mongoose.models.Subject || mongoose.model('Subject', schema);
export const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
