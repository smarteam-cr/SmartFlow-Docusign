import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_TIMEOUT_MS = 10_000;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  docIdentificacion: string;
}

export interface ContactDetails {
  id: string;
  identification: string;
  country: string;
}

export interface DealSummary {
  id: string;
  currencyCode: string;
}

export interface Company {
  id: string;
  razonSocial: string;
  pais: string;
}

export interface LineItem {
  id: string;
  name: string;
  sku: string;
  price: string;
}

export interface DealOwner {
  id: string;
  name: string;
  email: string;
}

export interface Capex {
  id: string;
  qrCapex: string;
  nombre: string;
  cantidad: string;
  costoNeto: string;
  hsCreatedate: string;
}

export interface Direccion {
  id: string;
  direction: string;
}

export interface Quote {
  id: string;
  hsQuoteLink: string;
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

  /**
   * Reads extended properties of a single contact (identification + country).
   * Used by the envelope flow to fill DocuSign tabs that are NOT exposed in
   * the lightweight contact list endpoint (PII separation).
   *
   * @throws NotFoundError(CONTACT_NOT_FOUND) if HubSpot returns 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getContactDetails(contactId: string): Promise<ContactDetails>;

  /**
   * Reads top-level Deal properties needed by the envelope flow (currency).
   * @throws NotFoundError(DEAL_NOT_FOUND)
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDeal(dealId: string): Promise<DealSummary>;

  /**
   * Returns the company marked as Primary for this Deal in HubSpot.
   * Detection: filters association results whose `associationTypes[].label`
   * matches "Primary" (case-insensitive).
   *
   * @throws ValidationError(DEAL_HAS_NO_COMPANY) if the Deal has no primary
   * @throws NotFoundError(DEAL_NOT_FOUND) on 404 from associations
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealPrimaryCompany(dealId: string): Promise<Company>;

  /**
   * Returns the SINGLE line item associated to this Deal. Throws if the Deal
   * has zero or more than one line item — the demo design supports only deals
   * with exactly one product (Roadmap §15 R1 contemplates dropdown for many).
   *
   * @throws ValidationError(DEAL_LINE_ITEMS_INVALID) if 0 or >1
   * @throws NotFoundError(DEAL_NOT_FOUND)
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealLineItem(dealId: string): Promise<LineItem>;

  /**
   * Returns the HubSpot Owner assigned to the Deal (Propietario in v2 routing).
   *
   * @throws NotFoundError(DEAL_NOT_FOUND) if dealId doesn't exist
   * @throws ValidationError(DEAL_OWNER_MISSING) if the Deal has no hubspot_owner_id
   * @throws ValidationError(OWNER_EMAIL_MISSING) if the owner has no email
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealOwner(dealId: string): Promise<DealOwner>;

  /**
   * Reads a single contact by id (used to resolve the Proveedor contact
   * configured in TEMPLATE_PROVEEDOR_MAP). Returns the Contact shape — the
   * email may be empty; the email-required validation is the caller's job.
   *
   * @throws ValidationError(PROVEEDOR_CONTACT_NOT_FOUND) on 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getContactById(contactId: string): Promise<Contact>;

  /**
   * Returns the IDs of contacts associated to a Deal whose association has
   * the USER_DEFINED label `responsable_jurídico`. Returns empty array if
   * none match. Duplicates within the same contact are de-duped.
   *
   * @throws NotFoundError(DEAL_NOT_FOUND) on 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  findJuridicoContactIds(dealId: string): Promise<string[]>;

  /**
   * Returns capex (custom object 2-58142466) associated to a Deal, ordered by
   * `hs_createdate` ascending. Tolerates missing field values (empty strings).
   *
   * @throws ValidationError(CAPEX_TOO_MANY) when there are more than 6 capex
   * @throws NotFoundError(DEAL_NOT_FOUND) on 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealCapex(dealId: string): Promise<Capex[]>;

  /**
   * Returns direcciones (custom object 2-53973802) associated to a Company,
   * ordered by `hs_createdate` ascending. No upper cap.
   *
   * @throws NotFoundError(COMPANY_NOT_FOUND) on 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getCompanyDirecciones(companyId: string): Promise<Direccion[]>;

  /**
   * Returns the most recent Quote (by hs_createdate desc) associated to a Deal.
   * `hsQuoteLink` may be empty (tolerated — caller decides if it blocks).
   *
   * @throws ValidationError(QUOTE_NOT_FOUND) when the Deal has 0 quotes
   * @throws NotFoundError(DEAL_NOT_FOUND) on 404
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealLatestQuote(dealId: string): Promise<Quote>;
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
          properties: ['firstname', 'lastname', 'email', 'doc_identificacion'],
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
          properties?: {
            firstname?: string;
            lastname?: string;
            email?: string;
            doc_identificacion?: string;
          };
        }>;
      };

      return (batchBody.results ?? [])
        .map((r) => ({
          id: r.id ?? '',
          firstName: r.properties?.firstname?.trim() ?? '',
          lastName: r.properties?.lastname?.trim() ?? '',
          email: r.properties?.email?.trim() ?? '',
          docIdentificacion: r.properties?.doc_identificacion?.trim() ?? '',
        }))
        .filter((c) => c.id !== '' && c.email !== '');
    },

    async getContactDetails(contactId: string): Promise<ContactDetails> {
      const url =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}` +
        `?properties=documento_de_identidad,country`;

      const res = await hubspotFetch(url);

      if (res.status === 404) {
        throw new NotFoundError(
          'CONTACT_NOT_FOUND',
          `Contact ${contactId} no existe en HubSpot`,
          { contactId }
        );
      }
      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al leer detalles del contacto`,
          { contactId, status: res.status }
        );
      }

      const body = (await res.json()) as {
        id?: string;
        properties?: { documento_de_identidad?: string; country?: string };
      };

      return {
        id: body.id ?? contactId,
        identification: body.properties?.documento_de_identidad?.trim() ?? '',
        country: body.properties?.country?.trim() ?? '',
      };
    },

    async getDeal(dealId: string): Promise<DealSummary> {
      const url =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${encodeURIComponent(dealId)}` +
        `?properties=deal_currency_code`;

      const res = await hubspotFetch(url);

      if (res.status === 404) {
        throw new NotFoundError(
          'DEAL_NOT_FOUND',
          `Deal ${dealId} no existe en HubSpot`,
          { dealId }
        );
      }
      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al leer el Deal`,
          { dealId, status: res.status }
        );
      }

      const body = (await res.json()) as {
        id?: string;
        properties?: { deal_currency_code?: string };
      };

      return {
        id: body.id ?? dealId,
        currencyCode: body.properties?.deal_currency_code?.trim() ?? '',
      };
    },

    async getDealPrimaryCompany(dealId: string): Promise<Company> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/companies`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, {
          dealId,
        });
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer associations a companies`,
          { dealId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{
          toObjectId?: string | number;
          associationTypes?: Array<{ label?: string }>;
        }>;
      };

      const primary = (assocBody.results ?? []).find((r) =>
        (r.associationTypes ?? []).some(
          (t) => (t.label ?? '').toLowerCase() === 'primary'
        )
      );

      if (!primary || primary.toObjectId === undefined || primary.toObjectId === null) {
        throw new ValidationError(
          'DEAL_HAS_NO_COMPANY',
          `El Deal ${dealId} no tiene empresa principal asociada`,
          { dealId }
        );
      }

      const companyId = String(primary.toObjectId);

      const companyUrl =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/companies/${encodeURIComponent(companyId)}` +
        `?properties=raz_n_social__c,pais`;
      const companyRes = await hubspotFetch(companyUrl);

      if (companyRes.status === 404) {
        throw new ValidationError(
          'DEAL_HAS_NO_COMPANY',
          `La empresa ${companyId} asociada al Deal ${dealId} fue eliminada o archivada`,
          { dealId, companyId }
        );
      }
      if (!companyRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${companyRes.status} al leer la company ${companyId}`,
          { dealId, companyId, status: companyRes.status }
        );
      }

      const companyBody = (await companyRes.json()) as {
        id?: string;
        properties?: { raz_n_social__c?: string; pais?: string };
      };

      return {
        id: companyBody.id ?? companyId,
        razonSocial: companyBody.properties?.raz_n_social__c?.trim() ?? '',
        pais: companyBody.properties?.pais?.trim() ?? '',
      };
    },

    async getDealLineItem(dealId: string): Promise<LineItem> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/line_items`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, {
          dealId,
        });
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer associations a line_items`,
          { dealId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{ toObjectId?: string | number }>;
      };
      const ids = (assocBody.results ?? [])
        .map((r) => r.toObjectId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map((id) => String(id));

      if (ids.length !== 1) {
        throw new ValidationError(
          'DEAL_LINE_ITEMS_INVALID',
          `El Deal ${dealId} debe tener exactamente un line item (encontrados: ${ids.length})`,
          { dealId, lineItemCount: ids.length }
        );
      }

      const lineItemId = ids[0] as string;

      const liUrl =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/line_items/${encodeURIComponent(lineItemId)}` +
        `?properties=name,hs_sku,price`;
      const liRes = await hubspotFetch(liUrl);

      if (liRes.status === 404) {
        throw new ValidationError(
          'DEAL_LINE_ITEMS_INVALID',
          `El line item ${lineItemId} del Deal ${dealId} fue eliminado o archivado`,
          { dealId, lineItemId }
        );
      }
      if (!liRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${liRes.status} al leer line item ${lineItemId}`,
          { dealId, lineItemId, status: liRes.status }
        );
      }

      const liBody = (await liRes.json()) as {
        id?: string;
        properties?: { name?: string; hs_sku?: string; price?: string };
      };

      return {
        id: liBody.id ?? lineItemId,
        name: liBody.properties?.name?.trim() ?? '',
        sku: liBody.properties?.hs_sku?.trim() ?? '',
        price: liBody.properties?.price?.trim() ?? '',
      };
    },

    async getDealOwner(dealId: string): Promise<DealOwner> {
      const dealUrl =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${encodeURIComponent(dealId)}` +
        `?properties=hubspot_owner_id`;
      const dealRes = await hubspotFetch(dealUrl);

      if (dealRes.status === 404) {
        throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, { dealId });
      }
      if (!dealRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${dealRes.status} al leer owner del Deal`,
          { dealId, status: dealRes.status }
        );
      }

      const dealBody = (await dealRes.json()) as {
        properties?: { hubspot_owner_id?: string | null };
      };

      const ownerId = dealBody.properties?.hubspot_owner_id?.trim();
      if (!ownerId) {
        throw new ValidationError(
          'DEAL_OWNER_MISSING',
          `El Deal ${dealId} no tiene propietario asignado en HubSpot`,
          { dealId }
        );
      }

      const ownerUrl = `${HUBSPOT_BASE_URL}/crm/v3/owners/${encodeURIComponent(ownerId)}`;
      const ownerRes = await hubspotFetch(ownerUrl);

      if (ownerRes.status === 404) {
        throw new ValidationError(
          'OWNER_NOT_FOUND',
          `El propietario ${ownerId} asignado al Deal ${dealId} fue eliminado o desactivado en HubSpot`,
          { dealId, ownerId }
        );
      }
      if (!ownerRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${ownerRes.status} al leer el owner ${ownerId}`,
          { dealId, ownerId, status: ownerRes.status }
        );
      }

      const ownerBody = (await ownerRes.json()) as {
        id?: string | number;
        firstName?: string;
        lastName?: string;
        email?: string;
      };

      const email = ownerBody.email?.trim() ?? '';
      if (!email) {
        throw new ValidationError(
          'OWNER_EMAIL_MISSING',
          `El propietario ${ownerId} del Deal ${dealId} no tiene email configurado`,
          { dealId, ownerId }
        );
      }

      const name = `${ownerBody.firstName ?? ''} ${ownerBody.lastName ?? ''}`.trim();
      return { id: String(ownerId), name, email };
    },

    async getContactById(contactId: string): Promise<Contact> {
      const url =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}` +
        `?properties=firstname,lastname,email,doc_identificacion`;
      const res = await hubspotFetch(url);

      if (res.status === 404) {
        throw new ValidationError(
          'PROVEEDOR_CONTACT_NOT_FOUND',
          `El contacto proveedor ${contactId} no existe en HubSpot (revisa TEMPLATE_PROVEEDOR_MAP)`,
          { contactId }
        );
      }
      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al leer el contacto proveedor ${contactId}`,
          { contactId, status: res.status }
        );
      }

      const body = (await res.json()) as {
        id?: string;
        properties?: {
          firstname?: string;
          lastname?: string;
          email?: string;
          doc_identificacion?: string;
        };
      };

      return {
        id: body.id ?? contactId,
        firstName: body.properties?.firstname?.trim() ?? '',
        lastName: body.properties?.lastname?.trim() ?? '',
        email: body.properties?.email?.trim() ?? '',
        docIdentificacion: body.properties?.doc_identificacion?.trim() ?? '',
      };
    },

    async getDealCapex(dealId: string): Promise<Capex[]> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/2-58142466`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError(
          'DEAL_NOT_FOUND',
          `Deal ${dealId} no existe en HubSpot`,
          { dealId }
        );
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer asociaciones a capex`,
          { dealId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{ toObjectId?: string | number }>;
      };
      const ids = (assocBody.results ?? [])
        .map((r) => r.toObjectId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map((id) => String(id));

      if (ids.length > 6) {
        throw new ValidationError(
          'CAPEX_TOO_MANY',
          `El Deal ${dealId} tiene ${ids.length} capex asociados; el máximo permitido es 6`,
          { dealId, count: ids.length }
        );
      }
      if (ids.length === 0) return [];

      const batchUrl = `${HUBSPOT_BASE_URL}/crm/v3/objects/2-58142466/batch/read`;
      const batchRes = await hubspotFetch(batchUrl, {
        method: 'POST',
        body: JSON.stringify({
          inputs: ids.map((id) => ({ id })),
          properties: ['qr_capex', 'nombre', 'cantidad', 'costo_neto', 'hs_createdate'],
        }),
      });

      if (!batchRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${batchRes.status} al batch-read de capex`,
          { dealId, status: batchRes.status }
        );
      }

      const batchBody = (await batchRes.json()) as {
        results?: Array<{
          id?: string;
          properties?: {
            qr_capex?: string;
            nombre?: string;
            cantidad?: string;
            costo_neto?: string;
            hs_createdate?: string;
          };
        }>;
      };

      return (batchBody.results ?? [])
        .map((r) => ({
          id: r.id ?? '',
          qrCapex: r.properties?.qr_capex?.trim() ?? '',
          nombre: r.properties?.nombre?.trim() ?? '',
          cantidad: r.properties?.cantidad?.trim() ?? '',
          costoNeto: r.properties?.costo_neto?.trim() ?? '',
          hsCreatedate: r.properties?.hs_createdate ?? '',
        }))
        .sort((a, b) => a.hsCreatedate.localeCompare(b.hsCreatedate));
    },

    async getCompanyDirecciones(companyId: string): Promise<Direccion[]> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/2-53973802`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError(
          'COMPANY_NOT_FOUND',
          `Company ${companyId} no existe en HubSpot`,
          { companyId }
        );
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer asociaciones a direcciones`,
          { companyId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{ toObjectId?: string | number }>;
      };
      const ids = (assocBody.results ?? [])
        .map((r) => r.toObjectId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map((id) => String(id));

      if (ids.length === 0) return [];

      const batchUrl = `${HUBSPOT_BASE_URL}/crm/v3/objects/2-53973802/batch/read`;
      const batchRes = await hubspotFetch(batchUrl, {
        method: 'POST',
        body: JSON.stringify({
          inputs: ids.map((id) => ({ id })),
          properties: ['direction', 'hs_createdate'],
        }),
      });

      if (!batchRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${batchRes.status} al batch-read de direcciones`,
          { companyId, status: batchRes.status }
        );
      }

      const batchBody = (await batchRes.json()) as {
        results?: Array<{
          id?: string;
          properties?: { direction?: string; hs_createdate?: string };
        }>;
      };

      return (batchBody.results ?? [])
        .map((r) => ({
          id: r.id ?? '',
          direction: r.properties?.direction?.trim() ?? '',
          hsCreatedate: r.properties?.hs_createdate ?? '',
        }))
        .sort((a, b) => a.hsCreatedate.localeCompare(b.hsCreatedate))
        .map(({ id, direction }) => ({ id, direction }));
    },

    async getDealLatestQuote(dealId: string): Promise<Quote> {
      const assocUrl = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/quotes`;
      const assocRes = await hubspotFetch(assocUrl);

      if (assocRes.status === 404) {
        throw new NotFoundError(
          'DEAL_NOT_FOUND',
          `Deal ${dealId} no existe en HubSpot`,
          { dealId }
        );
      }
      if (!assocRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${assocRes.status} al leer asociaciones a quotes`,
          { dealId, status: assocRes.status }
        );
      }

      const assocBody = (await assocRes.json()) as {
        results?: Array<{ toObjectId?: string | number }>;
      };
      const ids = (assocBody.results ?? [])
        .map((r) => r.toObjectId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map((id) => String(id));

      if (ids.length === 0) {
        throw new ValidationError(
          'QUOTE_NOT_FOUND',
          `El Deal ${dealId} no tiene cotizaciones asociadas. Crea una en HubSpot.`,
          { dealId }
        );
      }

      const batchUrl = `${HUBSPOT_BASE_URL}/crm/v3/objects/quotes/batch/read`;
      const batchRes = await hubspotFetch(batchUrl, {
        method: 'POST',
        body: JSON.stringify({
          inputs: ids.map((id) => ({ id })),
          properties: ['hs_quote_link', 'hs_createdate'],
        }),
      });

      if (!batchRes.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${batchRes.status} al batch-read de quotes`,
          { dealId, status: batchRes.status }
        );
      }

      const batchBody = (await batchRes.json()) as {
        results?: Array<{
          id?: string;
          properties?: { hs_quote_link?: string; hs_createdate?: string };
        }>;
      };

      const sorted = (batchBody.results ?? [])
        .map((r) => ({
          id: r.id ?? '',
          hsQuoteLink: r.properties?.hs_quote_link?.trim() ?? '',
          hsCreatedate: r.properties?.hs_createdate ?? '',
        }))
        .sort((a, b) => b.hsCreatedate.localeCompare(a.hsCreatedate));

      const latest = sorted[0];
      if (!latest) {
        throw new ValidationError(
          'QUOTE_NOT_FOUND',
          `El Deal ${dealId} tenía quotes asociadas pero ninguna se pudo leer.`,
          { dealId }
        );
      }
      return { id: latest.id, hsQuoteLink: latest.hsQuoteLink };
    },

    async findJuridicoContactIds(dealId: string): Promise<string[]> {
      const url = `${HUBSPOT_BASE_URL}/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts`;
      const res = await hubspotFetch(url);

      if (res.status === 404) {
        throw new NotFoundError(
          'DEAL_NOT_FOUND',
          `Deal ${dealId} no existe en HubSpot`,
          { dealId }
        );
      }
      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al buscar contactos jurídicos`,
          { dealId, status: res.status }
        );
      }

      const body = (await res.json()) as {
        results?: Array<{
          toObjectId?: string | number;
          associationTypes?: Array<{ label?: string }>;
        }>;
      };

      const ids = new Set<string>();
      for (const r of body.results ?? []) {
        const hasJuridico = (r.associationTypes ?? []).some(
          (t) => t.label === 'responsable_jurídico'
        );
        if (hasJuridico && r.toObjectId !== undefined && r.toObjectId !== null) {
          ids.add(String(r.toObjectId));
        }
      }
      return [...ids];
    },
  };
}
