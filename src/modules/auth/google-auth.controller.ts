import type { FastifyReply, FastifyRequest } from 'fastify';
import "@fastify/cookie";
import { googleAuthService } from './google-auth.service';
import { postgresUserRepository } from './postgres-user.repository';
import jwt from 'jsonwebtoken';

const JWT_SECRET: string = (() => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is required');
  return s;
})();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export class GoogleAuthController {
  /**
   * Redirects the user to Google's OAuth2 consent screen.
   */
  async login(_request: FastifyRequest, reply: FastifyReply) {
    const url = googleAuthService.getGoogleAuthUrl();
    return reply.redirect(url);
  }

  /**
   * Handles the callback from Google, exchanges code for tokens,
   * fetches user profile, finds/creates user, sets cookie and redirects.
   */
  async callback(request: FastifyRequest<{ Querystring: { code: string } }>, reply: FastifyReply) {
    const { code } = request.query;

    if (!code) {
      return reply.code(400).send({ error: 'Authorization code is missing' });
    }

    try {
      // 1. Exchange code for tokens
      const tokens = await googleAuthService.getGoogleTokens(code);

      // 2. Get user profile
      const profile = await googleAuthService.getGoogleUserProfile(tokens.access_token);

      // 3. Find or create user in DB
      let user = await postgresUserRepository.findUserByGoogleId(profile.id);

      if (user) {
        request.log.info({ userId: user.id }, 'User found by Google ID');
      } else {
        request.log.info({ googleId: profile.id }, 'User not found by Google ID, checking email');
        
        // Double check by email if user existed before with same email
        user = await postgresUserRepository.findUserByEmail(profile.email);

        if (user) {
          request.log.info({ userId: user.id, email: user.email }, 'User found by email, linking Google ID');
          // Update existing user with google_id
          user = await postgresUserRepository.linkGoogleId(user.id, profile.id);
        } else {
          request.log.info({ email: profile.email }, 'User not found by email, creating new Google user');
          // Create new user
          user = await postgresUserRepository.createGoogleUser({
            username: profile.email.split('@')[0], // Simple username from email
            email: profile.email,
            googleId: profile.id,
            displayName: profile.name,
            avatar: profile.picture,
          });
        }
      }

      // 4. Generate JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // 5. Set HttpOnly Cookie
      void reply.setCookie('accessToken', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      // 6. Redirect to frontend callback page with token so JS can save it
      return reply.redirect(
        `${FRONTEND_URL}/auth/google/callback?token=${encodeURIComponent(token)}`,
      );
    } catch (error: any) {
      request.log.error(error);
      return reply.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }
  }
}

export const googleAuthController = new GoogleAuthController();
