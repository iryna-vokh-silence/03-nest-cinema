import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.validation';
import { applyTestEnv } from './test-env';

/**
 * Runs once before all e2e tests: drops the test database, so every run
 * starts from an empty database (collections and indexes are created by
 * the application itself, exactly as on a fresh MongoDB).
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const { MONGODB_URI } = validateEnv(process.env);
  const connection = await mongoose
    .createConnection(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
