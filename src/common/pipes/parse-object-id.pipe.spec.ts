import { BadRequestException } from '@nestjs/common';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();
  const meta = { type: 'param' as const, data: 'id' };

  it('accepts 24 hex characters and lower-cases them', () => {
    expect(pipe.transform('6650F1A2B3C4D5E6F7A8B9C0', meta)).toBe(
      '6650f1a2b3c4d5e6f7a8b9c0',
    );
  });

  it.each([
    'abc',
    '123',
    'aaaaaaaaaaaa', // 12 characters: accepted by ObjectId.isValid, not by us
    '6650f1a2b3c4d5e6f7a8b9c', // 23
    '6650f1a2b3c4d5e6f7a8b9c00', // 25
    '6650f1a2b3c4d5e6f7a8b9cz',
    '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f7a8b9c', // a UUID from HW2
  ])('rejects %s with 400 explaining the format', (value) => {
    expect(() => pipe.transform(value, meta)).toThrow(BadRequestException);
    expect(() => pipe.transform(value, meta)).toThrow(
      'id must be a MongoDB ObjectId: a 24-character hexadecimal string',
    );
  });
});
