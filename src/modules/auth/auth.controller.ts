import type { FastifyReply, FastifyRequest } from 'fastify';
import "@fastify/cookie";
import jwt from 'jsonwebtoken';
import type { AuthService } from './auth.service';
import { authService } from './auth.service';
import { LoginParams, RegisterParams } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface RegisterBody extends RegisterParams { }
export interface LoginBody extends LoginParams { }

export class AuthController {
    private readonly service: AuthService;

    constructor(service: AuthService) {
        this.service = service;
    }

    async register(
        request: FastifyRequest<{ Body: RegisterBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { username, email, password } = request.body;

            if (!username || !email || !password) {
                void reply.code(400).send({
                    error: 'username, email, and password are required',
                });
                return;
            }


            const result = await this.service.register({ username, email, password });
            
            // Set cookie for token
            void reply.setCookie('accessToken', result.token, {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60, // 7 days
            });

            void reply.code(200).send(result);
        } catch (error) {
          request.log.error(
            { err: error, email: request.body?.email, username: request.body?.username },
            'Auth register failed',
          );
            if (error instanceof Error && error.message === 'User already exists') {
                void reply.code(409).send({ error: 'User already exists' });
            } else {
                void reply.code(500).send({ error: 'Internal server error' });
            }
        }
    }

    async login(
        request: FastifyRequest<{ Body: LoginBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { email, password } = request.body;

            if (!email || !password) {
                void reply.code(400).send({
                    error: 'email and password are required',
                });
                return;
            }

            const result = await this.service.login({ email, password });

            // Set cookie for token
            void reply.setCookie('accessToken', result.token, {
                path: '/',
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60, // 7 days
            });

            void reply.send(result);
        } catch (error) {
          request.log.error(
            { err: error, email: request.body?.email },
            'Auth login failed',
          );
            if (error instanceof Error && error.message === 'Invalid credentials') {
                void reply.code(401).send({ error: 'Invalid credentials' });
            } else {
                void reply.code(500).send({ error: 'Internal server error' });
            }
        }
    }

    async updateAvatar(
        request: FastifyRequest<{ Body: { avatar: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const userId = (request as any).user?.userId;
            const { avatar } = request.body;

            if (!userId) {
                void reply.code(401).send({ error: 'Unauthorized' });
                return;
            }

            const user = await this.service.updateAvatar(userId, avatar);
            void reply.send(user);
        } catch (error) {
          request.log.error({ err: error }, 'Update avatar failed');
            void reply.code(500).send({ error: 'Internal server error' });
        }
    }

  async updateStatus(
    request: FastifyRequest<{ Body: { status: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const userId = (request as any).user?.userId;
      const { status } = request.body;

      if (!userId) {
        void reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const user = await this.service.updateStatus(userId, status);
      void reply.send(user);
    } catch (error) {
      request.log.error({ err: error }, 'Update status failed');
      void reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async me(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const userId = (request as any).user?.userId;

      if (!userId) {
        void reply.code(401).send({ error: 'Unauthorized: Missing or invalid token' });
        return;
      }

      const user = await this.service.findUserById(userId);
      if (!user) {
        void reply.code(404).send({ error: 'User not found in database' });
        return;
      }

      // Map the user to match the strict AuthUser schema
      const responseUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };

      // Return a fresh JWT so cookie-only auth users (OAuth) also get a
      // token that the frontend can pass to the RTC signaling service.
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' },
      );

      void reply.code(200).send({ ...responseUser, token });
    } catch (error) {
      request.log.error({ err: error }, 'Get profile failed');
      void reply.code(500).send({ error: 'Internal server error while fetching user profile' });
    }
  }

  async logout(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      void reply.clearCookie('accessToken', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      void reply.code(200).send({ message: 'Logged out successfully' });
    } catch (error) {
      reply.log.error({ err: error }, 'Logout failed');
      void reply.code(500).send({ error: 'Internal server error' });
    }
  }
}


export const authController = new AuthController(authService);
