import type { Env } from '../../config/env.js';
import type { TenantConfig, TenantConfigProvider } from './types.js';

/**
 * Demo implementation: builds a single TenantConfig from validated process.env.
 * In production (Roadmap §15.2), replace with createMongoTenantConfigProvider.
 */
export function createEnvTenantConfigProvider(env: Env): TenantConfigProvider {
  const config: TenantConfig = {
    hubspot: {
      accessToken: env.HUBSPOT_ACCESS_TOKEN,
    },
    docusign: {
      clientId: env.DOCUSIGN_CLIENT_ID,
      userId: env.DOCUSIGN_IMPERSONATED_USER_ID,
      privateKey: env.DOCUSIGN_PRIVATE_KEY,
      accountId: env.DOCUSIGN_ACCOUNT_ID,
      basePath: env.DOCUSIGN_BASE_PATH,
    },
  };

  return {
    getConfig: () => config,
  };
}
