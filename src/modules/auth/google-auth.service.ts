import axios from 'axios';
import { stringify } from 'querystring';

export interface GoogleTokens {
  access_token: string;
  id_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

export class GoogleAuthService {
  private readonly config = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  };

  /**
   * Generates the Google OAuth2 consent screen URL.
   */
  getGoogleAuthUrl(): string {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const options = {
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
    };

    return `${rootUrl}?${stringify(options)}`;
  }

  /**
   * Exchanges authorization code for access and ID tokens.
   */
  async getGoogleTokens(code: string): Promise<GoogleTokens> {
    const url = 'https://oauth2.googleapis.com/token';
    const values = {
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    };

    try {
      const res = await axios.post<GoogleTokens>(url, stringify(values), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      return res.data;
    } catch (error: any) {
      console.error('Error fetching Google tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for tokens');
    }
  }

  /**
   * Fetches user profile using the access token.
   */
  async getGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
    const url = 'https://www.googleapis.com/oauth2/v2/userinfo';
    try {
      const res = await axios.get<GoogleUserProfile>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return res.data;
    } catch (error: any) {
      console.error('Error fetching user info:', error.response?.data || error.message);
      throw new Error('Failed to fetch user profile');
    }
  }
}

export const googleAuthService = new GoogleAuthService();
