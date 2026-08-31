import { describe, expect, test } from '@jest/globals';
import { parseEnv } from '../env.js';

describe('parseEnv', () => {
  const validEnv = {
    PORT: '3002',
    NODE_ENV: 'development',
    HUBSPOT_ACCESS_TOKEN: 'pat-na1-xxxxxxxx',
    DOCUSIGN_CLIENT_ID: 'abc-123',
    DOCUSIGN_IMPERSONATED_USER_ID: '11111111-2222-3333-4444-555555555555',
    DOCUSIGN_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
    DOCUSIGN_ACCOUNT_ID: 'account-1',
    DOCUSIGN_BASE_PATH: 'https://demo.docusign.net',
    HUBSPOT_PARAMETROS_DC_OBJECT_TYPE: '2-68469940',
    DOCUSIGN_CONNECT_HMAC_SECRET: 'my-hmac-secret',
    HUBSPOT_PORTAL_ID: '12345678',
  };

  test('parses a valid env object', () => {
    const env = parseEnv(validEnv);
    expect(env.PORT).toBe(3002);
    expect(env.NODE_ENV).toBe('development');
    expect(env.HUBSPOT_ACCESS_TOKEN).toBe('pat-na1-xxxxxxxx');
  });

  test('coerces PORT to number', () => {
    const env = parseEnv(validEnv);
    expect(typeof env.PORT).toBe('number');
  });

  test('defaults NODE_ENV to development when missing', () => {
    const { NODE_ENV: _omit, ...rest } = validEnv;
    const env = parseEnv(rest);
    expect(env.NODE_ENV).toBe('development');
  });

  test('throws when HUBSPOT_ACCESS_TOKEN is missing', () => {
    const { HUBSPOT_ACCESS_TOKEN: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow();
  });

  test('throws when DOCUSIGN_IMPERSONATED_USER_ID is not a UUID', () => {
    expect(() =>
      parseEnv({ ...validEnv, DOCUSIGN_IMPERSONATED_USER_ID: 'not-a-uuid' })
    ).toThrow();
  });

  test('rejects invalid NODE_ENV values', () => {
    expect(() =>
      parseEnv({ ...validEnv, NODE_ENV: 'staging' })
    ).toThrow();
  });

  test('throws when HUBSPOT_PARAMETROS_DC_OBJECT_TYPE is missing', () => {
    const { HUBSPOT_PARAMETROS_DC_OBJECT_TYPE: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow();
  });

  test('throws when DOCUSIGN_CONNECT_HMAC_SECRET is missing', () => {
    const { DOCUSIGN_CONNECT_HMAC_SECRET: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow();
  });

  test('throws when HUBSPOT_PORTAL_ID is missing', () => {
    const { HUBSPOT_PORTAL_ID: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow();
  });
});
