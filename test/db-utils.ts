import { Connection } from 'mongoose';

/** Empties every collection of the test database (indexes stay). */
export async function clearAll(connection: Connection): Promise<void> {
  const collections = await connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
