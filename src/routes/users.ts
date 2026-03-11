import { FastifyPluginAsync } from "fastify";
import { userController } from "../modules/user/user.controller";

const UserResponseSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["id", "displayName", "online"],
    properties: {
      id: { type: "string" },
      displayName: { type: "string" },
      avatarUrl: { type: "string", nullable: true },
      online: { type: "boolean" },
      lastSeenAt: { type: "string", format: "date-time", nullable: true },
    },
  },
};

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/users",
    {
      schema: {
        description: "Get all users",
        tags: ["users"],
        response: {
          200: UserResponseSchema,
        },
      },
    },
    userController.getUsers.bind(userController)
  );
};

export default usersRoutes;
