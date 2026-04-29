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
      // 1) Re-fetch the contact list for this Deal (closes the trust-boundary:
      //    the frontend cannot send to a contact that doesn't belong to the Deal).
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

      // 3) Defensive guard: the adapter already filters out contacts without
      //    email, but we re-check here in case a future adapter changes that.
      if (!chosen.email) {
        throw new ValidationError(
          'CONTACT_EMAIL_MISSING',
          `El contacto ${chosen.id} no tiene email — DocuSign lo necesita para enviar`,
          { dealId: input.dealId, contactId: chosen.id }
        );
      }

      // 4) Compose the envelope using the chosen contact.
      const roleName = await deps.docusign.getFirstRoleName(input.templateId);
      const prefillTabs = await deps.templateMapping.resolveTabValues({
        templateId: input.templateId,
        contact: {
          firstName: chosen.firstName,
          lastName: chosen.lastName,
          email: chosen.email,
        },
      });

      const { envelopeId, status } = await deps.docusign.sendEnvelopeFromTemplate({
        templateId: input.templateId,
        signer: {
          name: `${chosen.firstName} ${chosen.lastName}`.trim(),
          email: chosen.email,
          roleName,
        },
        prefillTabs,
      });

      return {
        envelopeId,
        status,
        recipientEmail: chosen.email,
      };
    },
  };
}
