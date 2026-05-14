import {
  NotFoundError,
  ValidationError,
} from '../lib/errors/index.js';
import type { HubSpotAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter } from '../integrations/Docusign/index.js';
import type { TemplateMappingResolver } from '../lib/template-mapping/index.js';
import type { TemplateRolesResolver } from '../lib/template-roles/index.js';

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
  templateRoles: TemplateRolesResolver;
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

      // 2) Find the chosen contact (Cliente) in the list; reject if not found.
      const chosen = contacts.find((c) => c.id === input.contactId);
      if (!chosen) {
        throw new ValidationError(
          'CONTACT_NOT_IN_DEAL',
          `El contacto ${input.contactId} no pertenece al Deal ${input.dealId}`,
          { dealId: input.dealId, contactId: input.contactId }
        );
      }

      if (!chosen.email) {
        throw new ValidationError(
          'CONTACT_EMAIL_MISSING',
          `El contacto ${chosen.id} no tiene email — DocuSign lo necesita para enviar`,
          { dealId: input.dealId, contactId: chosen.id }
        );
      }

      // 3) Resolve Propietario (deal owner). Adapter throws DEAL_OWNER_MISSING /
      // OWNER_EMAIL_MISSING if the structural data is incomplete.
      const owner = await deps.hubspot.getDealOwner(input.dealId);

      // 4) Resolve Proveedor configured for this template.
      const proveedorContactId = deps.templateRoles.getProveedorContactId(input.templateId);
      if (!proveedorContactId) {
        throw new ValidationError(
          'PROVEEDOR_NOT_CONFIGURED',
          `No hay proveedor configurado para el template ${input.templateId} (revisa TEMPLATE_PROVEEDOR_MAP)`,
          { templateId: input.templateId }
        );
      }

      const proveedor = await deps.hubspot.getContactById(proveedorContactId);
      if (!proveedor.email) {
        throw new ValidationError(
          'PROVEEDOR_EMAIL_MISSING',
          `El contacto proveedor ${proveedor.id} no tiene email — DocuSign lo necesita para enviar`,
          { templateId: input.templateId, contactId: proveedor.id }
        );
      }

      // 5) Fetch extended data in parallel (used to build the tabs).
      const [contactDetails, deal, company, lineItem] = await Promise.all([
        deps.hubspot.getContactDetails(input.contactId),
        deps.hubspot.getDeal(input.dealId),
        deps.hubspot.getDealPrimaryCompany(input.dealId),
        deps.hubspot.getDealLineItem(input.dealId),
      ]);

      // 6) Build mapping context and resolve the 11 tabs (carried by Propietario).
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

      const proveedorName = `${proveedor.firstName} ${proveedor.lastName}`.trim();
      const clienteName = `${chosen.firstName} ${chosen.lastName}`.trim();

      // 7) Send envelope with the 3 sequential signers.
      const { envelopeId, status } = await deps.docusign.sendEnvelopeFromTemplate({
        templateId: input.templateId,
        roles: [
          {
            roleName: 'Propietario',
            name: owner.name,
            email: owner.email,
            routingOrder: 1,
            tabs,
          },
          {
            roleName: 'Proveedor',
            name: proveedorName,
            email: proveedor.email,
            routingOrder: 2,
          },
          {
            roleName: 'Cliente',
            name: clienteName,
            email: chosen.email,
            routingOrder: 3,
          },
        ],
      });

      return {
        envelopeId,
        status,
        recipientEmail: proveedor.email,
      };
    },
  };
}
