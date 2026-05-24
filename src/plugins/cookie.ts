import { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';

export const cookiePlugin = fp(async (app: FastifyInstance) => {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) throw new Error('COOKIE_SECRET environment variable is required');

  void app.register(fastifyCookie, {
    secret,
    parseOptions: {},
  });
});

export default cookiePlugin;
