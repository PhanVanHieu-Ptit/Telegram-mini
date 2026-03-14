import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {
  PG_HOST,
  PG_PORT,
  PG_DATABASE,
  PG_USER,
  PG_PASSWORD,
} = process.env;

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT ? Number(PG_PORT) : undefined,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
});

async function createFcmTokensTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      device_type VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, token)
    );
  `;

  try {
    await pgPool.query(query);
    console.log('fcm_tokens table created successfully');
  } catch (error) {
    console.error('Error creating fcm_tokens table:', error);
  } finally {
    await pgPool.end();
  }
}

createFcmTokensTable();
