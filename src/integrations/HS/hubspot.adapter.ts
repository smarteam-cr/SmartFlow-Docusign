import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_TIMEOUT_MS = 10_000;

/**
 * Hard limit on capex per Deal. Mirrors the template DocuSign which has 6
 * fixed rows. Beyond this the data can't be rendered, so the adapter blocks.
 */
export const MAX_CAPEX_PER_DEAL = 6;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  docIdentificacion: string;
}

export interface Company {
  id: string;
  razonSocial: string;
  pais: string;
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

  updateDealProperties(dealId: string, properties: Record<string, string>): Promise<void>;

  createNoteForDeal(params: {
    dealId: string;
    body: string;
    contactIds?: string[];
    attachmentIds?: string[];
  }): Promise<{ noteId: string }>;
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

  // v4 associations: GET /crm/v4/objects/{fromObject}/{fromId}/associations/{toObject}
  // Used as the first step of any "list associated objects then batch-read them" flow.
  async function fetchAssociationIds(
    fromObject: string,
    fromId: string,
    toObject: string,
    notFoundCode: string
  ): Promise<string[]> {
    const url = `${HUBSPOT_BASE_URL}/crm/v4/objects/${fromObject}/${encodeURIComponent(fromId)}/associations/${toObject}`;
    const res = await hubspotFetch(url);

    if (res.status === 404) {
      throw new NotFoundError(
        notFoundCode,
        `${fromObject} ${fromId} no existe en HubSpot`,
        { fromObject, fromId }
      );
    }
    if (!res.ok) {
      throw new ExternalServiceError(
        'HUBSPOT_UNAVAILABLE',
        `HubSpot respondió ${res.status} al leer asociaciones ${fromObject}→${toObject}`,
        { fromObject, fromId, toObject, status: res.status }
      );
    }

    const body = (await res.json()) as {
      results?: Array<{ toObjectId?: string | number }>;
    };
    return (body.results ?? [])
      .map((r) => r.toObjectId)
      .filter((id): id is string | number => id !== undefined && id !== null)
      .map((id) => String(id));
  }

  // v3 batch read: POST /crm/v3/objects/{objectType}/batch/read
  // Returns raw results[]; callers map to their public shape.
  async function batchReadObjects(
    objectType: string,
    ids: string[],
    properties: string[],
    errorContext: Record<string, unknown>
  ): Promise<Array<{ id?: string; properties?: Record<string, string | undefined> }>> {
    const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/${objectType}/batch/read`;
    const res = await hubspotFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        inputs: ids.map((id) => ({ id })),
        properties,
      }),
    });

    if (!res.ok) {
      throw new ExternalServiceError(
        'HUBSPOT_UNAVAILABLE',
        `HubSpot respondió ${res.status} al batch-read de ${objectType}`,
        { ...errorContext, status: res.status }
      );
    }

    const body = (await res.json()) as {
      results?: Array<{ id?: string; properties?: Record<string, string | undefined> }>;
    };
    return body.results ?? [];
  }

  return {
    async getDealContacts(dealId: string): Promise<Contact[]> {
      const ids = await fetchAssociationIds('deals', dealId, 'contacts', 'DEAL_NOT_FOUND');
      if (ids.length === 0) return [];

      const results = await batchReadObjects(
        'contacts',
        ids,
        ['firstname', 'lastname', 'email', 'doc_identificacion'],
        { dealId }
      );

      return results
        .map((r) => ({
          id: r.id ?? '',
          firstName: r.properties?.firstname?.trim() ?? '',
          lastName: r.properties?.lastname?.trim() ?? '',
          email: r.properties?.email?.trim() ?? '',
          docIdentificacion: r.properties?.doc_identificacion?.trim() ?? '',
        }))
        .filter((c) => c.id !== '' && c.email !== '');
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
      const ids = await fetchAssociationIds('deals', dealId, '2-58142466', 'DEAL_NOT_FOUND');

      if (ids.length > MAX_CAPEX_PER_DEAL) {
        throw new ValidationError(
          'CAPEX_TOO_MANY',
          `El Deal ${dealId} tiene ${ids.length} capex asociados; el máximo permitido es ${MAX_CAPEX_PER_DEAL}`,
          { dealId, count: ids.length, max: MAX_CAPEX_PER_DEAL }
        );
      }
      if (ids.length === 0) return [];

      const results = await batchReadObjects(
        '2-58142466',
        ids,
        ['qr_capex', 'nombre', 'cantidad', 'costo_neto', 'hs_createdate'],
        { dealId }
      );

      return results
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
      const ids = await fetchAssociationIds(
        'companies',
        companyId,
        '2-53973802',
        'COMPANY_NOT_FOUND'
      );
      if (ids.length === 0) return [];

      const results = await batchReadObjects(
        '2-53973802',
        ids,
        ['direction', 'hs_createdate'],
        { companyId }
      );

      return results
        .map((r) => ({
          id: r.id ?? '',
          direction: r.properties?.direction?.trim() ?? '',
          hsCreatedate: r.properties?.hs_createdate ?? '',
        }))
        .sort((a, b) => a.hsCreatedate.localeCompare(b.hsCreatedate))
        .map(({ id, direction }) => ({ id, direction }));
    },

    async getDealLatestQuote(dealId: string): Promise<Quote> {
      const ids = await fetchAssociationIds('deals', dealId, 'quotes', 'DEAL_NOT_FOUND');

      if (ids.length === 0) {
        throw new ValidationError(
          'QUOTE_NOT_FOUND',
          `El Deal ${dealId} no tiene cotizaciones asociadas. Crea una en HubSpot.`,
          { dealId }
        );
      }

      const results = await batchReadObjects(
        'quotes',
        ids,
        ['hs_quote_link', 'hs_createdate'],
        { dealId }
      );

      const latest = results
        .map((r) => ({
          id: r.id ?? '',
          hsQuoteLink: r.properties?.hs_quote_link?.trim() ?? '',
          hsCreatedate: r.properties?.hs_createdate ?? '',
        }))
        .reduce<{ id: string; hsQuoteLink: string; hsCreatedate: string } | null>(
          (best, q) =>
            best === null || q.hsCreatedate.localeCompare(best.hsCreatedate) > 0 ? q : best,
          null
        );

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

    async updateDealProperties(dealId: string, properties: Record<string, string>): Promise<void> {
      const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${encodeURIComponent(dealId)}`;
      const res = await hubspotFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
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
          `HubSpot respondió ${res.status} al actualizar Deal ${dealId}`,
          { dealId, status: res.status }
        );
      }
    },

    async createNoteForDeal(params: {
      dealId: string;
      body: string;
      contactIds?: string[];
      attachmentIds?: string[];
    }): Promise<{ noteId: string }> {
      const associations: Array<{
        to: { id: string };
        types: Array<{ associationCategory: string; associationTypeId: number }>;
      }> = [
        {
          to: { id: params.dealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
        },
      ];

      for (const contactId of params.contactIds ?? []) {
        associations.push({
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        });
      }

      const properties: Record<string, string> = {
        hs_note_body: params.body,
        hs_timestamp: new Date().toISOString(),
      };

      if (params.attachmentIds && params.attachmentIds.length > 0) {
        properties.hs_attachment_ids = params.attachmentIds.join(';');
      }

      const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/notes`;
      const res = await hubspotFetch(url, {
        method: 'POST',
        body: JSON.stringify({ properties, associations }),
      });

      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al crear Note para Deal ${params.dealId}`,
          { dealId: params.dealId, status: res.status }
        );
      }

      const resBody = (await res.json()) as { id?: string };
      return { noteId: resBody.id ?? '' };
    },
  };
}
