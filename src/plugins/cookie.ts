import { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';

export const cookiePlugin = fp(async (app: FastifyInstance) => {
  void app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'your-cookie-secret-key-at-least-32-chars',
    parseOptions: {},
  });
});

export default cookiePlugin;
