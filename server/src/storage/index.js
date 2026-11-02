import { createCloudinaryStorage } from './cloudinaryAdapter.js';
import { createMemoryStorage } from './memoryAdapter.js';
import { log } from '../utils/logger.js';

// Storage contract: putObject({key,buffer}) -> {bytes}; statObject(key) -> {bytes}|null; deleteObject(key) -> boolean;
// getObjectStream({key,start?,end?,signal?}) -> {stream} (inclusive offsets; throws ObjectNotFoundError / StorageUnavailableError).
// Controllers depend only on this contract, so the provider can be swapped without touching them.
export function createStorage(config) {
  if (config.storageDriver === 'cloudinary') return createCloudinaryStorage(config.cloudinary);
  log.warn('Using in-memory storage: uploads are lost on restart. Set Cloudinary credentials for real storage.');
  return createMemoryStorage();
}
