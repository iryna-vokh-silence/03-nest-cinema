/**
 * MongoDB ObjectId in its text form: exactly 24 hexadecimal characters.
 *
 * Types.ObjectId.isValid() is deliberately not used: it also accepts any
 * 12-character string (e.g. "aaaaaaaaaaaa"), which is not a valid id in a URL.
 */
export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const OBJECT_ID_EXAMPLE = '6650f1a2b3c4d5e6f7a8b9c0';

export const OBJECT_ID_FORMAT =
  'a MongoDB ObjectId: a 24-character hexadecimal string';

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}

/** Error text for a malformed id, e.g. "id must be a MongoDB ObjectId: ...". */
export function objectIdMessage(name: string): string {
  return `${name} must be ${OBJECT_ID_FORMAT} (e.g. ${OBJECT_ID_EXAMPLE})`;
}
