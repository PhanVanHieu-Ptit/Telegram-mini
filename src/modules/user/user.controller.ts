import { FastifyReply, FastifyRequest } from "fastify";
import { userService } from "./user.service";

export class UserController {
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const users = await userService.getAllUsers();
      return reply.code(200).send(users);
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  }
}

export const userController = new UserController();
