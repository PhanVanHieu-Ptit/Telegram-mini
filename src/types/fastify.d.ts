import { Server as SocketIOServer } from "socket.io";
import { Db } from "mongodb";
import { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
    mongo: Db;
    pgPool: Pool;
  }
}
