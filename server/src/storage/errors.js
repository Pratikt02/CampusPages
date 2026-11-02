export class ObjectNotFoundError extends Error { constructor() { super('object not found'); this.name = 'ObjectNotFoundError'; } }
export class StorageUnavailableError extends Error {
  constructor(detail = '') { super('storage unavailable'); this.name = 'StorageUnavailableError'; this.detail = detail; }
}
