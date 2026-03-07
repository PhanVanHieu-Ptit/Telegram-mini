import { pgPool } from './src/core/db';
import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const queries = [
    `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);`,
  ];

  for (const query of queries) {
    try {
      await pgPool.query(query);
      console.log(`Executed: ${query}`);
    } catch (err: any) {
      console.error(`Error executing ${query}:`, err.message);
    }
  }
  await pgPool.end();
}

migrate();
