import { config as loadDotenv } from 'dotenv';

export const DEFAULT_TEST_URI = 'mongodb://localhost:27017/cinema_test';

/**
 * The e2e tests run against a SEPARATE database (MONGODB_TEST_URI, default
 * mongodb://localhost:27017/cinema_test), never the development one: they
 * drop it and empty its collections. Variables set in the shell win over .env.
 */
export function applyTestEnv(): void {
  loadDotenv({ quiet: true });
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || DEFAULT_TEST_URI;
}

applyTestEnv();
