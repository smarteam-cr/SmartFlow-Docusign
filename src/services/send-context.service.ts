import type { Contact, Direccion, HubSpotAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter, TemplateSummary } from '../integrations/Docusign/index.js';
import { AppError } from '../lib/errors/index.js';
import type { TeamCountryResolver } from '../lib/team-country/index.js';

export interface SendContextResult {
  clienteMode: 'juridico' | 'dropdown' | 'multiple_juridicos_error';
  juridicoContact: Contact | null;
  contacts: Contact[];
  direcciones: Direccion[];
  templates: TemplateSummary[];
  company: { razonSocial: string; pais: string } | null;
  capexCount: number;
  hasQuote: boolean;
  /** Propiedad direccion_fiscal de la Empresa asociada al Negocio ('' si no hay). */
  direccionFiscal: string;
  /** Propiedad pais del Negocio (Deal). */
  pais: string;
}

export interface SendContextService {
  getSendContext(dealId: string, userTeam?: string): Promise<SendContextResult>;
}

export interface SendContextServiceDeps {
  hubspot: Pick<
    HubSpotAdapter,
    'getDealContacts' | 'findJuridicoContactIds' | 'getDealPrimaryCompany' | 'getContactById' | 'getCompanyDirecciones' | 'getDealCapex' | 'getDealLatestQuote' | 'getDealProperties'
  >;
  docusign: Pick<DocusignAdapter, 'listTemplates'>;
  teamCountry: TeamCountryResolver;
}

/**
 * Deja solo los templates cuyo nombre empieza con el código de país
 * (ej. code "CR" → "CR - Acuerdo comercial..."). Case-insensitive y tolera
 * espacios alrededor del guión.
 */
function filterTemplatesByCountryCode(
  templates: TemplateSummary[],
  code: string
): TemplateSummary[] {
  const prefix = new RegExp(`^${code}\\s*-`, 'i');
  return templates.filter((t) => prefix.test(t.name.trim()));
}

export function createSendContextService(
  deps: SendContextServiceDeps
): SendContextService {
  return {
    async getSendContext(dealId: string, userTeam?: string): Promise<SendContextResult> {
      const [contacts, juridicoIds, companyResult, templates, capexResult, quoteResult, dealProps] = await Promise.all([
        deps.hubspot.getDealContacts(dealId),
        deps.hubspot.findJuridicoContactIds(dealId),
        deps.hubspot
          .getDealPrimaryCompany(dealId)
          .catch((err: unknown) => {
            if (err instanceof AppError && err.code === 'DEAL_HAS_NO_COMPANY') {
              return null;
            }
            throw err;
          }),
        deps.docusign.listTemplates(),
        deps.hubspot
          .getDealCapex(dealId)
          .catch((err: unknown) => {
            if (err instanceof AppError && err.code === 'CAPEX_TOO_MANY') {
              return [] as const;
            }
            throw err;
          }),
        deps.hubspot
          .getDealLatestQuote(dealId)
          .then(() => true as const)
          .catch((err: unknown) => {
            if (err instanceof AppError && err.code === 'QUOTE_NOT_FOUND') {
              return false as const;
            }
            throw err;
          }),
        deps.hubspot.getDealProperties(dealId, ['pais']),
      ]);

      let clienteMode: SendContextResult['clienteMode'];
      let juridicoContact: Contact | null = null;

      if (juridicoIds.length === 0) {
        clienteMode = 'dropdown';
      } else if (juridicoIds.length === 1) {
        clienteMode = 'juridico';
        juridicoContact = await deps.hubspot.getContactById(juridicoIds[0]!);
      } else {
        clienteMode = 'multiple_juridicos_error';
      }

      let direcciones: Direccion[] = [];
      if (companyResult) {
        direcciones = await deps.hubspot.getCompanyDirecciones(companyResult.id);
      }

      const company = companyResult
        ? { razonSocial: companyResult.razonSocial, pais: companyResult.pais }
        : null;
      const capexCount = capexResult.length;
      const hasQuote = quoteResult === true;
      const direccionFiscal = companyResult?.direccionFiscal ?? '';
      const pais = dealProps.pais ?? '';

      // Filtro por equipo: si el team mapea a un código de país, solo se
      // devuelven los templates de ese país. Team sin mapeo → sin filtro.
      const countryCode = userTeam ? deps.teamCountry.resolveCountryCode(userTeam) : null;
      const visibleTemplates = countryCode
        ? filterTemplatesByCountryCode(templates, countryCode)
        : templates;

      return { clienteMode, juridicoContact, contacts, direcciones, templates: visibleTemplates, company, capexCount, hasQuote, direccionFiscal, pais };
    },
  };
}
