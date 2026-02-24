import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export const swaggerPlugin = fp(async (fastify: FastifyInstance) => {
    await fastify.register(swagger, {
        openapi: {
            info: {
                title: 'Telegram Mini API',
                description: 'API documentation for Telegram Mini',
                version: '1.0.0',
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
                schemas: {
                    ErrorResponse: {
                        type: 'object',
                        properties: {
                            error: { type: 'string' },
                        },
                    },
                },
            },
            security: [{ bearerAuth: [] }],
        },
    });

    await fastify.register(swaggerUi, {
        routePrefix: '/docs/',
        uiConfig: {
            docExpansion: 'full',
            deepLinking: false,
        },
        staticCSP: false,
    });
});
