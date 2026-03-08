import type { FastifyPluginAsync } from "fastify";
import { authController, LoginBody, RegisterBody } from "../modules/auth/auth.controller";

const AuthRegisterBody = {
    type: 'object',
    required: ['username', 'email', 'password'],
    properties: {
        username: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
    },
};

const AuthLoginBody = {
    type: 'object',
    required: ['email', 'password'],
    properties: {
        email: { type: 'string' },
        password: { type: 'string' },
    },
};

const AuthUser = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
    },
};

const AuthResponse = {
    type: 'object',
    properties: {
        user: AuthUser,
        token: { type: 'string' },
    },
};

const ErrorResponse = {
    type: 'object',
    properties: {
        error: { type: 'string' },
    },
};

const routes: FastifyPluginAsync = async (fastify) => {
    fastify.post<{ Body: RegisterBody }>(
        '/register',
        {
            schema: {
                summary: 'Register a new user',
                tags: ['auth'],
                body: AuthRegisterBody,
                response: {
                    200: AuthResponse,
                    400: ErrorResponse,
                    409: ErrorResponse,
                    500: ErrorResponse,
                },
            },
        },
        (request, reply) => authController.register(request, reply),
    );

    fastify.post<{ Body: LoginBody }>(
        '/login',
        {
            schema: {
                summary: 'Login user',
                tags: ['auth'],
                body: AuthLoginBody,
                response: {
                    200: AuthResponse,
                    400: ErrorResponse,
                    401: ErrorResponse,
                    500: ErrorResponse,
                },
            },
        },
        (request, reply) => authController.login(request, reply),
    );

    fastify.patch<{ Body: { avatar: string } }>(
        '/update-avatar',
        {
            schema: {
                summary: 'Update user avatar',
                tags: ['auth'],
                body: {
                    type: 'object',
                    required: ['avatar'],
                    properties: {
                        avatar: { type: 'string' },
                    },
                },
                response: {
                    200: AuthUser,
                    401: ErrorResponse,
                    500: ErrorResponse,
                },
            },
            preHandler: fastify.authenticate,
        },
        (request, reply) => authController.updateAvatar(request, reply),
    );

    fastify.patch<{ Body: { status: string } }>(
        '/update-status',
        {
            schema: {
                summary: 'Update user status',
                tags: ['auth'],
                body: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                        status: { type: 'string' },
                    },
                },
                response: {
                    200: AuthUser,
                    401: ErrorResponse,
                    500: ErrorResponse,
                },
            },
            preHandler: fastify.authenticate,
        },
        (request, reply) => authController.updateStatus(request, reply),
    );

    fastify.get(
        '/me',
        {
            schema: {
                summary: 'Get current user information',
                tags: ['auth'],
                response: {
                    200: AuthUser,
                    401: ErrorResponse,
                    404: ErrorResponse,
                    500: ErrorResponse,
                },
            },
            preHandler: fastify.authenticate,
        },
        (request, reply) => authController.me(request, reply),
    );
};


export default routes;