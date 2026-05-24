import type { FastifyReply, FastifyRequest } from 'fastify';
import "@fastify/cookie";
import { facebookAuthService } from './facebook-auth.service';
import { postgresUserRepository } from './postgres-user.repository';
import jwt from 'jsonwebtoken';

const JWT_SECRET: string = (() => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is required');
  return s;
})();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export class FacebookAuthController {
  /**
   * Redirects the user to Facebook's OAuth authorization URL.
   */
  async login(_request: FastifyRequest, reply: FastifyReply) {
    const url = facebookAuthService.getFacebookAuthUrl();
    return reply.redirect(url);
  }

  /**
   * Handles the callback from Facebook, exchanges code for tokens,
   * fetches user profile, finds/creates user, sets cookie and redirects.
   */
  async callback(request: FastifyRequest<{ Querystring: { code: string } }>, reply: FastifyReply) {
    const { code } = request.query;

    if (!code) {
      return reply.code(400).send({ error: 'Authorization code is missing' });
    }

    try {
      // 1. Exchange code for tokens
      const tokens = await facebookAuthService.getFacebookTokens(code);

      // 2. Get user profile
      const profile = await facebookAuthService.getFacebookUserProfile(tokens.access_token);

      // 3. Find or create user in DB
      let user = await postgresUserRepository.findUserByFacebookId(profile.id);

      if (user) {
        request.log.info({ userId: user.id }, 'User found by Facebook ID');
      } else {
        request.log.info({ facebookId: profile.id }, 'User not found by Facebook ID, checking email');
        
        // If no facebook_id, check by email
        if (profile.email) {
          user = await postgresUserRepository.findUserByEmail(profile.email);
        }

        if (user) {
          request.log.info({ userId: user.id, email: user.email }, 'User found by email, linking Facebook ID');
          // Link the account
          user = await postgresUserRepository.linkFacebookId(user.id, profile.id);
        } else {
          request.log.info({ email: profile.email }, 'User not found by email, creating new Facebook user');
          // Create new user
          const email = profile.email || `${profile.id}@facebook.com`;
          user = await postgresUserRepository.createFacebookUser({
            username: email.split('@')[0] + '_' + Math.floor(Math.random() * 1000),
            email: email,
            facebookId: profile.id,
            displayName: profile.name,
            avatar: profile.picture?.data?.url || '',
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
        sameSite: 'lax', // Use 'lax' for redirects to work in most browsers
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      // 6. Redirect to frontend callback page with token so JS can save it
      return reply.redirect(
        `${FRONTEND_URL}/auth/facebook/callback?token=${encodeURIComponent(token)}`,
      );
    } catch (error: any) {
      request.log.error(error);
      return reply.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
    }
  }

  /**
   * Handles Facebook's data deletion request callback.
   */
  async dataDeletion(request: FastifyRequest<{ Body: { signed_request: string } }>, reply: FastifyReply) {
    const { signed_request } = request.body;

    if (!signed_request) {
      return reply.code(400).send({ error: 'signed_request is missing' });
    }

    try {
      const data = facebookAuthService.parseSignedRequest(signed_request);
      const facebookId = data.user_id;

      // 1. Find user by facebookId
      const user = await postgresUserRepository.findUserByFacebookId(facebookId);

      if (user) {
        // 2. Perform data deletion logic
        request.log.info(`Data deletion requested for Facebook user ${facebookId} (Internal ID: ${user.id})`);
        await postgresUserRepository.deleteUser(user.id);
      }

      // 3. Return confirmation response as required by Facebook
      const confirmationCode = `DEL_${facebookId}_${Date.now()}`;
      const statusUrl = `${FRONTEND_URL}/auth/deletion-status?code=${confirmationCode}`;

      return reply.send({
        url: statusUrl,
        confirmation_code: confirmationCode,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.code(400).send({ error: 'Invalid signed_request' });
    }
  }
}

export const facebookAuthController = new FacebookAuthController();
