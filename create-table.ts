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

async function createUsersTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'banned')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pgPool.query(query);
    console.log('Users table created successfully');
  } catch (error) {
    console.error('Error creating users table:', error);
  }
}

async function createConversationsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(20) DEFAULT 'private' CHECK (type IN ('private', 'group')),
      name VARCHAR(255),
      avatar VARCHAR(255),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pgPool.query(query);
    console.log('Conversations table created successfully');
  } catch (error) {
    console.error('Error creating conversations table:', error);
  }
}

async function createConversationMembersTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_read_message_id VARCHAR(255),
      unread_count INTEGER DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );
  `;

  try {
    await pgPool.query(query);
    console.log('Conversation members table created successfully');
  } catch (error) {
    console.error('Error creating conversation members table:', error);
  }
}



async function createTables() {
  await createUsersTable();
  await createConversationsTable();
  await createConversationMembersTable();
  await pgPool.end();
}

createTables();