import type { Contact, Direccion, HubSpotAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter, TemplateSummary } from '../integrations/Docusign/index.js';
import { AppError } from '../lib/errors/index.js';

export interface SendContextResult {
  clienteMode: 'juridico' | 'dropdown' | 'multiple_juridicos_error';
  juridicoContact: Contact | null;
  contacts: Contact[];
  direcciones: Direccion[];
  templates: TemplateSummary[];
  company: { razonSocial: string; pais: string } | null;
  capexCount: number;
  hasQuote: boolean;
}

export interface SendContextService {
  getSendContext(dealId: string): Promise<SendContextResult>;
}

export interface SendContextServiceDeps {
  hubspot: Pick<
    HubSpotAdapter,
    'getDealContacts' | 'findJuridicoContactIds' | 'getDealPrimaryCompany' | 'getContactById' | 'getCompanyDirecciones' | 'getDealCapex' | 'getDealLatestQuote'
  >;
  docusign: Pick<DocusignAdapter, 'listTemplates'>;
}

export function createSendContextService(
  deps: SendContextServiceDeps
): SendContextService {
  return {
    async getSendContext(dealId: string): Promise<SendContextResult> {
      const [contacts, juridicoIds, companyResult, templates, capexResult, quoteResult] = await Promise.all([
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

      return { clienteMode, juridicoContact, contacts, direcciones, templates, company, capexCount, hasQuote };
    },
  };
}
