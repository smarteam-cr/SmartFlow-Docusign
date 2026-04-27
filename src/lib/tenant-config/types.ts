/**
 * The full set of credentials needed to operate against HubSpot and DocuSign
 * for one tenant. In demo (single-tenant), this is built from process.env.
 * In production (Roadmap §15.2), this is fetched from Mongo per tenant.
 */
export interface TenantConfig {
  hubspot: {
    accessToken: string;
  };
  docusign: {
    clientId: string;
    userId: string;
    privateKey: string;
    accountId: string;
    basePath: string;
  };
}

/**
 * Port: any source of TenantConfig (env, Mongo, secrets manager) implements this.
 *
 * Note for demo: getConfig() is synchronous because env reads are synchronous.
 * Mongo implementation will return Promise<TenantConfig> and accept a tenantId.
 * The composition root will await accordingly when that day comes.
 */
export interface TenantConfigProvider {
  getConfig(): TenantConfig;
}
