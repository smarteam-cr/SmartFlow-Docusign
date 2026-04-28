import type { HubSpotAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter } from '../integrations/Docusign/index.js';
import type { TemplateMappingResolver } from '../lib/template-mapping/index.js';

export interface SendFromTemplateInput {
  dealId: string;
  templateId: string;
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
      const contact = await deps.hubspot.getDealPrimaryContact(input.dealId);
      const roleName = await deps.docusign.getFirstRoleName(input.templateId);
      const prefillTabs = await deps.templateMapping.resolveTabValues({
        templateId: input.templateId,
        contact,
      });

      const { envelopeId, status } = await deps.docusign.sendEnvelopeFromTemplate({
        templateId: input.templateId,
        signer: {
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          email: contact.email,
          roleName,
        },
        prefillTabs,
      });

      return {
        envelopeId,
        status,
        recipientEmail: contact.email,
      };
    },
  };
}
