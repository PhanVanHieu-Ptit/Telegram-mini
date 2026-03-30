import { MongoClient, type Db } from "mongodb";
import { Pool } from "pg";

const {
  MONGO_URI,
  MONGO_DB_NAME,
  PG_HOST,
  PG_PORT,
  PG_DATABASE,
  PG_USER,
  PG_PASSWORD,
} = process.env;

import mongoose from "mongoose";

let mongoClient: MongoClient | null = null;

export async function connectMongo(): Promise<Db> {
  if (!MONGO_URI || !MONGO_DB_NAME) {
    // eslint-disable-next-line no-console
    console.error(
      "MongoDB environment variables MONGO_URI or MONGO_DB_NAME are not set",
    );
    throw new Error("MongoDB configuration error");
  }

  try {
    // Connect Mongoose
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI, {
        dbName: MONGO_DB_NAME,
      });
    }

    if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URI);
    }

    await mongoClient.connect();
    const db = mongoClient.db(MONGO_DB_NAME);
    await db.command({ ping: 1 });
    return db;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", err);
    throw err;
  }
}

export const pgPool = new Pool({
  // Render/managed PostgreSQL usually requires SSL in production.
  // Local development stays non-SSL unless PG_SSL=true is explicitly set.
  // You can override with: PG_SSL=false or PG_SSL_REJECT_UNAUTHORIZED=true.
  ...(function getPgSslConfig() {
    const explicitDisableSsl = process.env.PG_SSL === "false";
    const explicitEnableSsl = process.env.PG_SSL === "true";
    const isRender = process.env.RENDER === "true";
    const isProduction = process.env.NODE_ENV === "production";
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(PG_HOST ?? "");
    const shouldUseSsl =
      explicitEnableSsl ||
      (!explicitDisableSsl && (isRender || isProduction || !isLocalHost));

    if (!shouldUseSsl) {
      return {};
    }

    return {
      ssl: process.env.PG_SSL_REJECT_UNAUTHORIZED === "false"
        ? { rejectUnauthorized: false }
        : true,
    };
  })(),
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: PG_HOST,
    port: PG_PORT ? Number(PG_PORT) : 5432,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD,
  }),
  connectionTimeoutMillis: 10000,
});

pgPool.on("error", (err: Error) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle PostgreSQL client", err);
});

