import jwt from 'jsonwebtoken';
import { ExternalServiceError } from '../../lib/errors/index.js';

const JWT_TTL_SECONDS = 3600;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const HTTP_TIMEOUT_MS = 10_000;

/**
 * Derives the DocuSign OAuth host from the eSignature base path.
 * Demo/sandbox (demo.docusign.net) → account-d.docusign.com.
 * Everything else (www.docusign.net, na*.docusign.net) → account.docusign.com.
 */
export function resolveDocusignOAuthHost(basePath: string): string {
  return /demo/i.test(basePath) ? 'account-d.docusign.com' : 'account.docusign.com';
}

export interface JwtAuthClient {
  /**
   * Returns a valid DocuSign access token. Cached in memory until 60s before expiry.
   * @throws ExternalServiceError(DOCUSIGN_AUTH_FAILED)
   */
  getAccessToken(): Promise<string>;
}

export interface JwtAuthClientConfig {
  clientId: string;
  userId: string;
  /**
   * RSA private key in PEM format. May arrive with `\n` literal (from .env);
   * we normalize internally.
   */
  privateKey: string;
  /**
   * OAuth host to authenticate against, e.g. account-d.docusign.com (demo) or
   * account.docusign.com (prod). Derive it with resolveDocusignOAuthHost().
   */
  oauthHost: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export function createJwtAuthClient(config: JwtAuthClientConfig): JwtAuthClient {
  const normalizedKey = config.privateKey.replace(/\\n/g, '\n');
  const tokenEndpoint = `https://${config.oauthHost}/oauth/token`;
  let cached: CachedToken | null = null;
  // In-flight promise: when a refresh is already underway, concurrent callers
  // share that promise instead of firing duplicate OAuth requests.
  let inflight: Promise<CachedToken> | null = null;

  async function requestNewToken(): Promise<CachedToken> {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: config.clientId,
      sub: config.userId,
      aud: config.oauthHost,
      iat: nowSec,
      exp: nowSec + JWT_TTL_SECONDS,
      scope: 'signature impersonation',
    };

    let signedJwt: string;
    try {
      signedJwt = jwt.sign(payload, normalizedKey, { algorithm: 'RS256' });
    } catch (err) {
      throw new ExternalServiceError(
        'DOCUSIGN_AUTH_FAILED',
        'No se pudo firmar el JWT (revisa DOCUSIGN_PRIVATE_KEY)',
        { cause: err instanceof Error ? err.message : String(err) }
      );
    }

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ExternalServiceError(
        'DOCUSIGN_AUTH_FAILED',
        'No se pudo contactar al OAuth de DocuSign',
        { cause: err instanceof Error ? err.message : String(err) }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new ExternalServiceError(
        'DOCUSIGN_AUTH_FAILED',
        `DocuSign OAuth respondió ${res.status}`,
        { status: res.status, body: errorBody.slice(0, 500) }
      );
    }

    const tokenResponse = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!tokenResponse.access_token || !tokenResponse.expires_in) {
      throw new ExternalServiceError(
        'DOCUSIGN_AUTH_FAILED',
        'Respuesta inesperada del OAuth de DocuSign',
        { response: JSON.stringify(tokenResponse).slice(0, 200) }
      );
    }

    return {
      token: tokenResponse.access_token,
      expiresAt: nowSec + tokenResponse.expires_in,
    };
  }

  return {
    async getAccessToken(): Promise<string> {
      const nowSec = Math.floor(Date.now() / 1000);
      if (cached && cached.expiresAt - TOKEN_REFRESH_BUFFER_SECONDS > nowSec) {
        return cached.token;
      }
      if (!inflight) {
        inflight = requestNewToken().finally(() => {
          inflight = null;
        });
      }
      cached = await inflight;
      return cached.token;
    },
  };
}
