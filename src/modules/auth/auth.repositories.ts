import type { User, RegisterParams } from './auth.types';

export interface IUserRepository {
  createUser(params: RegisterParams & { passwordHash: string }): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
}