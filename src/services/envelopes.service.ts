import {
  NotFoundError,
  ValidationError,
} from '../lib/errors/index.js';
import type { HubSpotAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter } from '../integrations/Docusign/index.js';
import type { TemplateMappingResolver } from '../lib/template-mapping/index.js';

export interface SendFromTemplateInput {
  dealId: string;
  templateId: string;
  contactId: string;
}

export interface SendFromTemplateResult {
  envelopeId: string;
  status: string;
  recipientEmail: string;
}

export interface EnvelopesService {
  sendFromTemplate(input: SendFromTemplateInput): Promise<SendFromTemplateResult>;
}

export interface EnvelopesServiceDeps {
  hubspot: HubSpotAdapter;
  docusign: DocusignAdapter;
  templateMapping: TemplateMappingResolver;
}

export function createEnvelopesService(deps: EnvelopesServiceDeps): EnvelopesService {
  return {
    async sendFromTemplate(input: SendFromTemplateInput): Promise<SendFromTemplateResult> {
      // 1) Re-fetch contact list for this Deal (closes the trust-boundary).
      const contacts = await deps.hubspot.getDealContacts(input.dealId);
      if (contacts.length === 0) {
        throw new NotFoundError(
          'NO_CONTACTS_FOR_DEAL',
          `El Deal ${input.dealId} no tiene contactos asociados con email`,
          { dealId: input.dealId }
        );
      }

      // 2) Find the chosen contact in the list; reject if not found.
      const chosen = contacts.find((c) => c.id === input.contactId);
      if (!chosen) {
        throw new ValidationError(
          'CONTACT_NOT_IN_DEAL',
          `El contacto ${input.contactId} no pertenece al Deal ${input.dealId}`,
          { dealId: input.dealId, contactId: input.contactId }
        );
      }

      // 3) Defensive: the adapter filters out empty emails, but re-check.
      if (!chosen.email) {
        throw new ValidationError(
          'CONTACT_EMAIL_MISSING',
          `El contacto ${chosen.id} no tiene email — DocuSign lo necesita para enviar`,
          { dealId: input.dealId, contactId: chosen.id }
        );
      }

      // 4) Fetch all the extended data + DocuSign role in parallel.
      const [contactDetails, deal, company, lineItem, roleName] = await Promise.all([
        deps.hubspot.getContactDetails(input.contactId),
        deps.hubspot.getDeal(input.dealId),
        deps.hubspot.getDealPrimaryCompany(input.dealId),
        deps.hubspot.getDealLineItem(input.dealId),
        deps.docusign.getFirstRoleName(input.templateId),
      ]);

      // 5) Build the mapping context and resolve the 11 tabs.
      const tabs = await deps.templateMapping.resolveTabValues({
        templateId: input.templateId,
        contact: {
          firstName: chosen.firstName,
          lastName: chosen.lastName,
          email: chosen.email,
        },
        contactDetails: {
          identification: contactDetails.identification,
          country: contactDetails.country,
        },
        company: {
          name: company.name,
          country: company.country,
          address: company.address,
        },
        lineItem: {
          name: lineItem.name,
          sku: lineItem.sku,
          price: lineItem.price,
        },
        dealCurrencyCode: deal.currencyCode,
      });

      // 6) Validate: no empty values across the resolved tabs.
      const missingFields = Object.entries(tabs)
        .filter(([, v]) => !v || v.trim() === '')
        .map(([k]) => k);

      if (missingFields.length > 0) {
        throw new ValidationError(
          'MISSING_REQUIRED_FIELD',
          `Faltan datos requeridos para los campos: ${missingFields.join(', ')}`,
          { missingFields }
        );
      }

      // 7) Send envelope.
      const { envelopeId, status } = await deps.docusign.sendEnvelopeFromTemplate({
        templateId: input.templateId,
        signer: {
          name: `${chosen.firstName} ${chosen.lastName}`.trim(),
          email: chosen.email,
          roleName,
        },
        prefillTabs: tabs,
      });

      return {
        envelopeId,
        status,
        recipientEmail: chosen.email,
      };
    },
  };
}
