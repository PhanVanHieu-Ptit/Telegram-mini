import axios from 'axios';
import { stringify } from 'querystring';
import crypto from 'crypto';

export interface FacebookTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface FacebookUserProfile {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
      is_silhouette: boolean;
    };
  };
}

export class FacebookAuthService {
  private readonly config = {
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/auth/facebook/callback',
  };

  /**
   * Generates the Facebook OAuth2 authorization URL.
   */
  getFacebookAuthUrl(): string {
    const rootUrl = 'https://www.facebook.com/v18.0/dialog/oauth';
    const options = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: ['email', 'public_profile'].join(','),
      response_type: 'code',
      auth_type: 'rerequest',
      display: 'popup',
    };

    return `${rootUrl}?${stringify(options)}`;
  }

  /**
   * Exchanges authorization code for access token.
   */
  async getFacebookTokens(code: string): Promise<FacebookTokens> {
    const url = 'https://graph.facebook.com/v18.0/oauth/access_token';
    const params = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
    };

    try {
      const res = await axios.get<FacebookTokens>(url, { params });
      return res.data;
    } catch (error: any) {
      console.error('Error fetching Facebook tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for tokens');
    }
  }

  /**
   * Fetches user profile using the access token.
   */
  async getFacebookUserProfile(accessToken: string): Promise<FacebookUserProfile> {
    const url = 'https://graph.facebook.com/me';
    const params = {
      fields: 'id,name,email,picture',
      access_token: accessToken,
    };

    try {
      const res = await axios.get<FacebookUserProfile>(url, { params });
      return res.data;
    } catch (error: any) {
      console.error('Error fetching Facebook user profile:', error.response?.data || error.message);
      throw new Error('Failed to fetch user profile');
    }
  }

  /**
   * Parses and validates a Facebook signed_request.
   * @param signedRequest The signed_request string from Facebook.
   * @returns The decoded payload if valid.
   */
  parseSignedRequest(signedRequest: string): any {
    const [encodedSig, payload] = signedRequest.split('.');

    // Decode signature and payload
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

    // Verify signature
    const expectedSig = crypto.createHmac('sha256', this.config.clientSecret)
      .update(payload)
      .digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      throw new Error('Invalid signed request signature');
    }

    return data;
  }
}

export const facebookAuthService = new FacebookAuthService();
