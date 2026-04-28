import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from '../../lib/errors/index.js';
import type { ContactInfo } from '../../lib/template-mapping/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_TIMEOUT_MS = 10_000;

export interface HubSpotAdapter {
  /**
   * Returns the first contact associated to a Deal, with firstName/lastName/email.
   * @throws NotFoundError(DEAL_NOT_FOUND | CONTACT_NOT_FOUND)
   * @throws ValidationError(CONTACT_EMAIL_MISSING)
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealPrimaryContact(dealId: string): Promise<ContactInfo>;
}

export interface HubSpotAdapterConfig {
  accessToken: string;
}

export function createHubSpotAdapter(config: HubSpotAdapterConfig): HubSpotAdapter {
  const headers = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };

  async function hubspotFetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HUBSPOT_TIMEOUT_MS);
    try {
      return await fetch(url, { headers, signal: controller.signal });
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
    async getDealPrimaryContact(dealId: string): Promise<ContactInfo> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, { dealId });
      }
      if (assocRes.status >= 500) {
        throw new ExternalServiceError('HUBSPOT_UNAVAILABLE', `HubSpot respondió ${assocRes.status}`, { dealId });
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
      const firstAssoc = assocBody.results?.[0];
      if (!firstAssoc?.toObjectId) {
        throw new NotFoundError(
          'CONTACT_NOT_FOUND',
          `El Deal ${dealId} no tiene contactos asociados`,
          { dealId }
        );
      }
      const contactId = String(firstAssoc.toObjectId);

      const propsUrl =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}` +
        `?properties=firstname,lastname,email`;
      const propsRes = await hubspotFetch(propsUrl);

      if (propsRes.status === 404) {
        throw new NotFoundError(
          'CONTACT_NOT_FOUND',
          `El contacto ${contactId} ya no existe en HubSpot`,
          { dealId, contactId }
        );
      }
      if (!propsRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${propsRes.status} al leer el contacto`,
          { dealId, contactId, status: propsRes.status }
        );
      }

      const propsBody = (await propsRes.json()) as {
        properties?: { firstname?: string; lastname?: string; email?: string };
      };
      const firstName = propsBody.properties?.firstname?.trim() ?? '';
      const lastName = propsBody.properties?.lastname?.trim() ?? '';
      const email = propsBody.properties?.email?.trim() ?? '';

      if (!email) {
        throw new ValidationError(
          'CONTACT_EMAIL_MISSING',
          `El contacto ${contactId} no tiene email — DocuSign lo necesita para enviar`,
          { dealId, contactId }
        );
      }

      return { firstName, lastName, email };
    },
  };
}
