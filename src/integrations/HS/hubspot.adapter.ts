import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_TIMEOUT_MS = 10_000;

/**
 * Hard limit on capex per Deal. Mirrors the template DocuSign which has 5
 * fixed rows. Beyond this the data can't be rendered, so the adapter blocks.
 */
export const MAX_CAPEX_PER_DEAL = 5;

/** Propiedades que se leen del objeto personalizado "Parametros DC". */
const PARAMETROS_DC_PROPERTIES = [
  'pais',
  'template',
  'legal_representative_code',
  'cm_id_hubspot_code',
  'usuario_legal',
] as const;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  docIdentificacion: string;
  /** País de origen (propiedad estándar country de HubSpot). */
  pais: string;
}

export interface Company {
  id: string;
  razonSocial: string;
  pais: string;
  /** Propiedad direccion_fiscal de la company. */
  direccionFiscal: string;
}

export interface DealOwner {
  id: string;
  name: string;
  email: string;
}

export interface Capex {
  id: string;
  codigo_qr: string;
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

/**
 * Fila del objeto personalizado "Parametros DC" de HubSpot: la configuración
 * de firmantes fijos de un template DocuSign. Sustituye al viejo
 * TEMPLATE_PROVEEDOR_MAP del .env.
 */
export interface ParametrosDc {
  /** hs_object_id de la fila. */
  recordId: string;
  /** Propiedad `pais` — valor crudo, sin normalizar ("Guatemala IV"). */
  pais: string;
  /** Propiedad `template` — el value de la opción ES el templateId de DocuSign. */
  templateId: string;
  /** Propiedad `legal_representative_code` — contactId del Proveedor. */
  legalRepresentativeCode: string;
  /** Propiedad `cm_id_hubspot_code` — contactId del CM. */
  cmIdHubspotCode: string;
  /** Propiedad `usuario_legal` — contactId del rol Legal. */
  usuarioLegal: string;
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
   * Returns the HubSpot Owner set in the Deal's `supervisor` property (a
   * "Usuario de HubSpot" field, so it stores an ownerId — not a contactId).
   * First signer of the envelope (routingOrder 1).
   *
   * @throws NotFoundError(DEAL_NOT_FOUND) if dealId doesn't exist
   * @throws ValidationError(DEAL_SUPERVISOR_MISSING) if the Deal has no supervisor
   * @throws ValidationError(SUPERVISOR_NOT_FOUND) if the owner was deleted/deactivated
   * @throws ValidationError(SUPERVISOR_EMAIL_MISSING) if the owner has no email
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getDealSupervisor(dealId: string): Promise<DealOwner>;

  /**
   * Reads a single contact by id (used to resolve the Proveedor contact
   * configured in "Parametros DC"). Returns the Contact shape — the
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

  getDealProperties(dealId: string, properties: string[]): Promise<Record<string, string>>;

  updateDealProperties(dealId: string, properties: Record<string, string>): Promise<void>;

  createNoteForDeal(params: {
    dealId: string;
    body: string;
    contactIds?: string[];
    attachmentIds?: string[];
  }): Promise<{ noteId: string }>;

  /**
   * Returns the "Parametros DC" row configured for a DocuSign template, or
   * null when no row matches. This is the source of the Proveedor, CM and
   * Legal signers (it replaced the TEMPLATE_PROVEEDOR_MAP env var).
   *
   * @throws ValidationError(PARAMETROS_DC_DUPLICATE) if more than one row matches
   * @throws ExternalServiceError(HUBSPOT_UNAVAILABLE)
   */
  getParametrosDcByTemplate(templateId: string): Promise<ParametrosDc | null>;
}

export interface HubSpotAdapterConfig {
  accessToken: string;
  /**
   * objectTypeId del objeto personalizado "Parametros DC" (ej. "2-68469940").
   * Es específico de cada portal, por eso viene de env y no hardcodeado.
   */
  parametrosDcObjectType: string;
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

  /**
   * Reads a HubSpot owner ("Usuario de HubSpot") and validates it has an email.
   * Shared by getDealOwner and getDealSupervisor — they differ only in which
   * error codes surface, so the caller passes them in.
   */
  async function fetchOwner(
    ownerId: string,
    codes: { notFound: string; emailMissing: string },
    errorContext: Record<string, unknown>
  ): Promise<DealOwner> {
    const url = `${HUBSPOT_BASE_URL}/crm/v3/owners/${encodeURIComponent(ownerId)}`;
    const res = await hubspotFetch(url);

    if (res.status === 404) {
      throw new ValidationError(
        codes.notFound,
        `El usuario de HubSpot ${ownerId} fue eliminado o desactivado`,
        { ...errorContext, ownerId }
      );
    }
    if (!res.ok) {
      throw new ExternalServiceError(
        'HUBSPOT_UNAVAILABLE',
        `HubSpot respondió ${res.status} al leer el owner ${ownerId}`,
        { ...errorContext, ownerId, status: res.status }
      );
    }

    const body = (await res.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    const email = body.email?.trim() ?? '';
    if (!email) {
      throw new ValidationError(
        codes.emailMissing,
        `El usuario de HubSpot ${ownerId} no tiene email configurado`,
        { ...errorContext, ownerId }
      );
    }

    return {
      id: ownerId,
      name: `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim(),
      email,
    };
  }

  /**
   * Reads one owner-typed property off a Deal (hubspot_owner_id, supervisor…)
   * and resolves it to the full owner. Both properties store an ownerId.
   */
  async function fetchDealOwnerByProperty(
    dealId: string,
    property: string,
    codes: { missing: string; missingMessage: string; notFound: string; emailMissing: string }
  ): Promise<DealOwner> {
    const dealUrl =
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${encodeURIComponent(dealId)}` +
      `?properties=${encodeURIComponent(property)}`;
    const dealRes = await hubspotFetch(dealUrl);

    if (dealRes.status === 404) {
      throw new NotFoundError('DEAL_NOT_FOUND', `Deal ${dealId} no existe en HubSpot`, { dealId });
    }
    if (!dealRes.ok) {
      throw new ExternalServiceError(
        'HUBSPOT_UNAVAILABLE',
        `HubSpot respondió ${dealRes.status} al leer ${property} del Deal`,
        { dealId, property, status: dealRes.status }
      );
    }

    const dealBody = (await dealRes.json()) as {
      properties?: Record<string, string | null | undefined>;
    };

    const ownerId = dealBody.properties?.[property]?.trim();
    if (!ownerId) {
      throw new ValidationError(codes.missing, codes.missingMessage, { dealId, property });
    }

    return fetchOwner(
      ownerId,
      { notFound: codes.notFound, emailMissing: codes.emailMissing },
      { dealId, property }
    );
  }

  return {
    async getDealContacts(dealId: string): Promise<Contact[]> {
      const ids = await fetchAssociationIds('deals', dealId, 'contacts', 'DEAL_NOT_FOUND');
      if (ids.length === 0) return [];

      const results = await batchReadObjects(
        'contacts',
        ids,
        ['firstname', 'lastname', 'email', 'doc_identificacion', 'country'],
        { dealId }
      );

      return results
        .map((r) => ({
          id: r.id ?? '',
          firstName: r.properties?.firstname?.trim() ?? '',
          lastName: r.properties?.lastname?.trim() ?? '',
          email: r.properties?.email?.trim() ?? '',
          docIdentificacion: r.properties?.doc_identificacion?.trim() ?? '',
          pais: r.properties?.country?.trim() ?? '',
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
        `?properties=raz_n_social__c,pais,direccion_fiscal`;
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
        properties?: { raz_n_social__c?: string; pais?: string; direccion_fiscal?: string };
      };

      return {
        id: companyBody.id ?? companyId,
        razonSocial: companyBody.properties?.raz_n_social__c?.trim() ?? '',
        pais: companyBody.properties?.pais?.trim() ?? '',
        direccionFiscal: companyBody.properties?.direccion_fiscal?.trim() ?? '',
      };
    },

    async getDealOwner(dealId: string): Promise<DealOwner> {
      return fetchDealOwnerByProperty(dealId, 'hubspot_owner_id', {
        missing: 'DEAL_OWNER_MISSING',
        missingMessage: `El Deal ${dealId} no tiene propietario asignado en HubSpot`,
        notFound: 'OWNER_NOT_FOUND',
        emailMissing: 'OWNER_EMAIL_MISSING',
      });
    },

    async getDealSupervisor(dealId: string): Promise<DealOwner> {
      return fetchDealOwnerByProperty(dealId, 'supervisor', {
        missing: 'DEAL_SUPERVISOR_MISSING',
        missingMessage: `El Deal ${dealId} no tiene supervisor asignado — es el primer firmante del contrato`,
        notFound: 'SUPERVISOR_NOT_FOUND',
        emailMissing: 'SUPERVISOR_EMAIL_MISSING',
      });
    },

    async getContactById(contactId: string): Promise<Contact> {
      const url =
        `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${encodeURIComponent(contactId)}` +
        `?properties=firstname,lastname,email,doc_identificacion,country`;
      const res = await hubspotFetch(url);

      if (res.status === 404) {
        throw new ValidationError(
          'PROVEEDOR_CONTACT_NOT_FOUND',
          `El contacto ${contactId} configurado en "Parametros DC" no existe en HubSpot`,
          { contactId }
        );
      }
      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al leer el contacto ${contactId}`,
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
          country?: string;
        };
      };

      return {
        id: body.id ?? contactId,
        firstName: body.properties?.firstname?.trim() ?? '',
        lastName: body.properties?.lastname?.trim() ?? '',
        email: body.properties?.email?.trim() ?? '',
        docIdentificacion: body.properties?.doc_identificacion?.trim() ?? '',
        pais: body.properties?.country?.trim() ?? '',
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
        ['codigo_qr', 'nombre', 'cantidad', 'costo_neto', 'hs_createdate'],
        { dealId }
      );

      return results
        .map((r) => ({
          id: r.id ?? '',
          codigo_qr: r.properties?.codigo_qr?.trim() ?? '',
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
          (t) => {
            const normalized = (t.label ?? '').toLowerCase().replace(/[\s_]+/g, '_');
            return normalized === 'responsable_jurídico';
          }
        );
        if (hasJuridico && r.toObjectId !== undefined && r.toObjectId !== null) {
          ids.add(String(r.toObjectId));
        }
      }
      return [...ids];
    },


    async getParametrosDcByTemplate(templateId: string): Promise<ParametrosDc | null> {
      const objectType = config.parametrosDcObjectType;
      const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/${encodeURIComponent(objectType)}/search`;
      // Nota: el índice de búsqueda de HubSpot es eventualmente consistente —
      // un cambio recién guardado en la UI puede tardar unos segundos en verse.
      const res = await hubspotFetch(url, {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: 'template', operator: 'EQ', value: templateId }] },
          ],
          properties: PARAMETROS_DC_PROPERTIES,
          limit: 2,
        }),
      });

      if (!res.ok) {
        throw new ExternalServiceError(
          'HUBSPOT_UNAVAILABLE',
          `HubSpot respondió ${res.status} al buscar la configuración "Parametros DC" del template ${templateId}`,
          { templateId, objectType, status: res.status }
        );
      }

      const body = (await res.json()) as {
        total?: number;
        results?: Array<{ id?: string; properties?: Record<string, string | null | undefined> }>;
      };

      const results = body.results ?? [];
      if (results.length === 0) return null;
      if (results.length > 1) {
        throw new ValidationError(
          'PARAMETROS_DC_DUPLICATE',
          `Hay ${body.total ?? results.length} filas de "Parametros DC" para el template ${templateId}; debe haber exactamente una`,
          { templateId, recordIds: results.map((r) => r.id ?? '') }
        );
      }

      const row = results[0]!;
      const props = row.properties ?? {};
      return {
        recordId: row.id ?? '',
        pais: props.pais?.trim() ?? '',
        templateId: props.template?.trim() ?? templateId,
        legalRepresentativeCode: props.legal_representative_code?.trim() ?? '',
        cmIdHubspotCode: props.cm_id_hubspot_code?.trim() ?? '',
        usuarioLegal: props.usuario_legal?.trim() ?? '',
      };
    },

    async getDealProperties(dealId: string, properties: string[]): Promise<Record<string, string>> {
      const query = properties.map((p) => encodeURIComponent(p)).join('&properties=');
      const url = `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${query}`;
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
          `HubSpot respondió ${res.status} al leer properties del Deal ${dealId}`,
          { dealId, status: res.status }
        );
      }

      const body = (await res.json()) as {
        properties?: Record<string, string | null | undefined>;
      };

      const result: Record<string, string> = {};
      for (const prop of properties) {
        result[prop] = body.properties?.[prop]?.trim() ?? '';
      }
      return result;
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
