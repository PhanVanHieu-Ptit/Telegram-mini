import type { Db } from "mongodb";
import { Pool } from "pg";
import mongoose from "mongoose";

const {
  MONGO_URI,
  MONGO_DB_NAME,
  PG_HOST,
  PG_PORT,
  PG_DATABASE,
  PG_USER,
  PG_PASSWORD,
  PG_POOL_MAX,
  PG_POOL_MIN,
  PG_IDLE_TIMEOUT_MS,
  PG_CONNECTION_TIMEOUT_MS,
  PG_MAX_USES,
  PG_KEEP_ALIVE,
  PG_KEEP_ALIVE_INITIAL_DELAY_MS,
} = process.env;
let mongoConnectionPromise: Promise<typeof mongoose> | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function connectMongo(): Promise<Db> {
  if (!MONGO_URI || !MONGO_DB_NAME) {
    // eslint-disable-next-line no-console
    console.error(
      "MongoDB environment variables MONGO_URI or MONGO_DB_NAME are not set",
    );
    throw new Error("MongoDB configuration error");
  }

  try {
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (mongoose.connection.readyState === 0) {
      if (!mongoConnectionPromise) {
        mongoConnectionPromise = mongoose.connect(MONGO_URI, {
          dbName: MONGO_DB_NAME,
        });
      }
      await mongoConnectionPromise;
      mongoConnectionPromise = null;
    } else if (mongoose.connection.readyState === 2 && mongoConnectionPromise) {
      await mongoConnectionPromise;
    }

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection is not ready");
    }

    await db.command({ ping: 1 });
    return db;
  } catch (err) {
    mongoConnectionPromise = null;
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
      return { ssl: undefined };
    }

    return {
      ssl: {
        rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === "true",
      },
    };
  })(),
  host: PG_HOST,
  port: PG_PORT ? Number(PG_PORT) : 5432,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
  max: parsePositiveInt(PG_POOL_MAX, 20),
  min: parsePositiveInt(PG_POOL_MIN, 2),
  idleTimeoutMillis: parsePositiveInt(PG_IDLE_TIMEOUT_MS, 30_000),
  connectionTimeoutMillis: parsePositiveInt(PG_CONNECTION_TIMEOUT_MS, 5_000),
  maxUses: parsePositiveInt(PG_MAX_USES, 7_500),
  keepAlive: PG_KEEP_ALIVE !== "false",
  keepAliveInitialDelayMillis: parsePositiveInt(PG_KEEP_ALIVE_INITIAL_DELAY_MS, 10_000),
});

pgPool.on("error", (err: Error) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle PostgreSQL client", err);
});

