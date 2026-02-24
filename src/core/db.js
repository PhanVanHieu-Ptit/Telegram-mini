const { MongoClient } = require("mongodb");
const { Pool } = require("pg");

const {
  MONGO_URI,
  MONGO_DB_NAME,
  PG_HOST,
  PG_PORT,
  PG_DATABASE,
  PG_USER,
  PG_PASSWORD,
} = process.env;

let mongoClient;

async function connectMongo() {
  if (!MONGO_URI || !MONGO_DB_NAME) {
    // eslint-disable-next-line no-console
    console.error("MongoDB environment variables MONGO_URI or MONGO_DB_NAME are not set");
    throw new Error("MongoDB configuration error");
  }

  if (!mongoClient || (mongoClient.topology && mongoClient.topology.isDestroyed())) {
    mongoClient = new MongoClient(MONGO_URI);
  }

  try {
    await mongoClient.connect();
    await mongoClient.db(MONGO_DB_NAME).command({ ping: 1 });
    return mongoClient.db(MONGO_DB_NAME);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB", err);
    throw err;
  }
}

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT ? Number(PG_PORT) : undefined,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
});

pgPool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle PostgreSQL client", err);
});

module.exports = {
  connectMongo,
  pgPool,
};

