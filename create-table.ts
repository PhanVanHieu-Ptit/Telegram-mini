import { Pool } from 'pg';

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
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
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
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

async function createConversationReadStatusTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS conversation_read_status (
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id VARCHAR(255),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id, user_id)
    );
  `;

  try {
    await pgPool.query(query);
    console.log('Conversation read status table created successfully');
  } catch (error) {
    console.error('Error creating conversation read status table:', error);
  }
}

async function createTables() {
  await createUsersTable();
  await createConversationsTable();
  await createConversationMembersTable();
  await createConversationReadStatusTable();
  await pgPool.end();
}

createTables();