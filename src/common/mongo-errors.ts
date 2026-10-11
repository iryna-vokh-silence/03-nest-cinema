/** MongoDB server error code of a unique index violation (E11000). */
export const MONGO_DUPLICATE_KEY = 11000;

/** True if `error` is a MongoDB duplicate key error (a unique index was violated). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === MONGO_DUPLICATE_KEY
  );
}
