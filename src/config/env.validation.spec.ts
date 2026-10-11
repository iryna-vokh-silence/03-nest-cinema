import { validateEnv } from './env.validation';

const VALID = { MONGODB_URI: 'mongodb://localhost:27017/cinema' };

describe('validateEnv', () => {
  it('converts and returns a valid configuration with defaults', () => {
    expect(validateEnv({ ...VALID })).toMatchObject({
      MONGODB_URI: 'mongodb://localhost:27017/cinema',
      PORT: 3000,
    });
    expect(validateEnv({ ...VALID, PORT: '8080' })).toMatchObject({
      PORT: 8080,
    });
    expect(
      validateEnv({
        MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.net/cinema',
      }).MONGODB_URI,
    ).toContain('cluster0');
  });

  it('refuses to start without MONGODB_URI', () => {
    expect(() => validateEnv({})).toThrow('MONGODB_URI is required');
  });

  it('rejects invalid values', () => {
    for (const uri of [
      '',
      'localhost:27017/cinema',
      'postgres://localhost:5432/cinema',
      'mongodb://localhost:27017',
      'mongodb://localhost:27017/',
    ]) {
      expect(() => validateEnv({ MONGODB_URI: uri })).toThrow('MONGODB_URI');
    }
    expect(() => validateEnv({ ...VALID, PORT: '3.5' })).toThrow('PORT');
    expect(() => validateEnv({ ...VALID, PORT: '70000' })).toThrow('PORT');
  });
});
