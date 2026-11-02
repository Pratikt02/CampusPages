import mongoose from 'mongoose';
import { log } from '../utils/logger.js';

export async function connectDb(uri) {
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  log.info('MongoDB connected');
}
export const dbState = () =>
  ({ 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' })[mongoose.connection.readyState] ?? 'unknown';
