
import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import ajvFormats from "ajv-formats";
import autoLoad from "@fastify/autoload";
import path from "node:path";
import { setupSocketIOServer } from "./socket";
import { connectMongo, pgPool } from "./core/db";
import dotenv from "dotenv";
import { swaggerPlugin } from "./plugins/swagger";
dotenv.config();


export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
	const app = fastify({
		logger: true,
		ajv: {
			customOptions: {
				strict: false,
			},
		},
		...options,
	});

	// Register ajv-formats for OpenAPI compatibility
	// @ts-ignore
	ajvFormats(app.validatorCompiler?.ajv || (app as any).ajv);

	// Decorate io
	app.decorate("io", null as any);

	// Register Swagger plugin before routes
	await app.register(swaggerPlugin);

	// Register plugins (other than swagger)
	app.register(autoLoad, {
		dir: path.join(__dirname, "plugins"),
		dirNameRoutePrefix: false,
		options: { prefix: "/api" },
		ignorePattern: /swagger\.(js|ts)$/,
	});

	// Register routes
	app.register(autoLoad, {
		dir: path.join(__dirname, "routes"),
		dirNameRoutePrefix: false,
	});

	// DB connections
	app.decorate("mongo", null as any);
	app.decorate("pgPool", pgPool);
	app.addHook("onReady", async function () {
		try {
			const mongo = await connectMongo();
			(this as any).mongo = mongo;
		} catch (err) {
			this.log.error({ err }, "MongoDB connection failed");
			throw err;
		}
	});

	// Socket integration
	app.addHook("onListen", async function () {
		const server = (this as any).server;
		setupSocketIOServer(server, this);
	});

	return app;
}

