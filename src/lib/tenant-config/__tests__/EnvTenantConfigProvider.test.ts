import { describe, expect, test } from '@jest/globals';
import { createEnvTenantConfigProvider } from '../EnvTenantConfigProvider.js';
import type { Env } from '../../../config/env.js';

const sampleEnv: Env = {
  PORT: 3000,
  NODE_ENV: 'development',
  HUBSPOT_ACCESS_TOKEN: 'pat-na1-token',
  DOCUSIGN_CLIENT_ID: 'client-id',
  DOCUSIGN_IMPERSONATED_USER_ID: '11111111-2222-3333-4444-555555555555',
  DOCUSIGN_PRIVATE_KEY: '-----BEGIN RSA-----\nkey\n-----END RSA-----',
  DOCUSIGN_ACCOUNT_ID: 'account-id',
  DOCUSIGN_BASE_PATH: 'https://demo.docusign.net',
  TEMPLATE_PROVEEDOR_MAP: '{}',
};

describe('createEnvTenantConfigProvider', () => {
  test('maps env to TenantConfig.hubspot', () => {
    const provider = createEnvTenantConfigProvider(sampleEnv);
    const cfg = provider.getConfig();
    expect(cfg.hubspot.accessToken).toBe('pat-na1-token');
  });

  test('maps env to TenantConfig.docusign', () => {
    const provider = createEnvTenantConfigProvider(sampleEnv);
    const cfg = provider.getConfig();
    expect(cfg.docusign).toEqual({
      clientId: 'client-id',
      userId: '11111111-2222-3333-4444-555555555555',
      privateKey: '-----BEGIN RSA-----\nkey\n-----END RSA-----',
      accountId: 'account-id',
      basePath: 'https://demo.docusign.net',
    });
  });

  test('returns the same TenantConfig on multiple calls (no recompute side effects)', () => {
    const provider = createEnvTenantConfigProvider(sampleEnv);
    expect(provider.getConfig()).toEqual(provider.getConfig());
  });
});
