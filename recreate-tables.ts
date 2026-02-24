import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
});

async function dropAndRecreate() {
    try {
        await pool.query('DROP TABLE IF EXISTS conversation_read_status CASCADE;');
        console.log('Dropped conversation_read_status table');

        await pool.query('DROP TABLE IF EXISTS conversation_members CASCADE;');
        console.log('Dropped conversation_members table');

        await pool.query('DROP TABLE IF EXISTS conversations CASCADE;');
        console.log('Dropped conversations table');

        await pool.query('DROP TABLE IF EXISTS users CASCADE;');
        console.log('Dropped users table');

        // Create updated users table with UUID and new columns
        const usersQuery = `
      CREATE TABLE users (
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

        await pool.query(usersQuery);
        console.log('Created users table');

        // Create conversations table
        const conversationsQuery = `
      CREATE TABLE conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

        await pool.query(conversationsQuery);
        console.log('Created conversations table');

        // Create conversation_members with UUID foreign key
        const membersQuery = `
      CREATE TABLE conversation_members (
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (conversation_id, user_id)
      );
    `;

        await pool.query(membersQuery);
        console.log('Created conversation_members table');

        await pool.end();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

dropAndRecreate();
