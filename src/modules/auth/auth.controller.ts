import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from './auth.service';
import { authService } from './auth.service';
import { LoginParams, RegisterParams } from './auth.types';

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
            void reply.code(200).send(result);
        } catch (error) {
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
            void reply.send(result);
        } catch (error) {
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
            void reply.code(500).send({ error: 'Internal server error' });
        }
    }
}


export const authController = new AuthController(authService);
