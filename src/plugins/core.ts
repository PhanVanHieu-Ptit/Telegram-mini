import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import cors from "@fastify/cors";

interface CorsConfig {
  origin: string | string[] | boolean;
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  maxAge?: number;
}

const corsConfig: CorsConfig = {
  // Allow requests from the frontend origin
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  // Enable credentials (cookies, authorization headers)
  credentials: true,
  // Allow these HTTP methods
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // Allow these request headers
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-App-Version",
    "X-Client-Type",
  ],
  // Expose these response headers to the client
  exposedHeaders: [
    "Content-Type",
    "Authorization",
    "X-App-Version",
    "X-Client-Type",
  ],
  // Cache preflight response for 1 hour
  maxAge: 3600,
};

const corePlugin: FastifyPluginAsync = async (fastify) => {
  // Register CORS plugin before all routes
  // This handles preflight OPTIONS requests automatically
  // and adds necessary CORS headers to all responses
  await fastify.register(cors, corsConfig);

  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok" as const };
  });
};

export default fp(corePlugin, {
  fastify: "5.x",
  name: "core-plugin",
});

