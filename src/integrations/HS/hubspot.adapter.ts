import {
  NotFoundError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_TIMEOUT_MS = 10_000;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface HubSpotAdapter {
  /**
   * Returns all contacts associated to a Deal that have a non-empty email.
   * Contacts without email are filtered out (DocuSign requires email).
   * Returns empty array if the Deal has no associated contacts (or none with email).
   *
   * @throws NotFoundError(DEAL_NOT_FOUND) if the dealId does not exist
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE) on network/5xx errors
   */
  getDealContacts(dealId: string): Promise<Contact[]>;
}

export interface HubSpotAdapterConfig {
  accessToken: string;
}

export function createHubSpotAdapter(config: HubSpotAdapterConfig): HubSpotAdapter {
  const headers = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };

  async function hubspotFetch(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HUBSPOT_TIMEOUT_MS);
    try {
      return await fetch(url, { headers, signal: controller.signal, ...init });
    } catch (err) {
      throw new ExternalServiceError(
        'HUBSPOT_UNAVAILABLE',
        'No se pudo contactar a HubSpot',
        { cause: err instanceof Error ? err.message : String(err) }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async getDealContacts(dealId: string): Promise<Contact[]> {
      // 1) List associated contact IDs for this Deal.
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, { dealId });
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer asociaciones`,
          { dealId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{ toObjectId?: string | number }>;
      };
      const contactIds = (assocBody.results ?? [])
        .map((r) => r.toObjectId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map((id) => String(id));

      if (contactIds.length === 0) {
        return [];
      }

      // 2) Batch-read properties for all contact IDs in a single call.
      const batchUrl = `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/batch/read`;
      const batchRes = await hubspotFetch(batchUrl, {
        method: 'POST',
        body: JSON.stringify({
          inputs: contactIds.map((id) => ({ id })),
          properties: ['firstname', 'lastname', 'email'],
        }),
      });

      if (!batchRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${batchRes.status} al batch-read de contactos`,
          { dealId, status: batchRes.status }
        );
      }

      const batchBody = (await batchRes.json()) as {
        results?: Array<{
          id?: string;
          properties?: { firstname?: string; lastname?: string; email?: string };
        }>;
      };

      return (batchBody.results ?? [])
        .map((r) => ({
          id: r.id ?? '',
          firstName: r.properties?.firstname?.trim() ?? '',
          lastName: r.properties?.lastname?.trim() ?? '',
          email: r.properties?.email?.trim() ?? '',
        }))
        .filter((c) => c.id !== '' && c.email !== '');
    },
  };
}
