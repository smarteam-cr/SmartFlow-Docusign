import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/errors/index.js';
import type {
  Contact,
  Direccion,
  HubSpotAdapter,
} from '../integrations/HS/index.js';
import type { DocusignAdapter } from '../integrations/Docusign/index.js';
import type {
  ResolutionContext,
  TemplateMappingResolver,
} from '../lib/template-mapping/index.js';
import type { TemplateRolesResolver } from '../lib/template-roles/index.js';
import { toISODate } from '../utils/toISODate.js';

export interface SendFromTemplateInput {
  dealId: string;
  templateId: string;
  contactId: string;
  directionId?: string;
  /** Ubicación del cliente — se envía tal cual al tab location del template. */
  location?: string;
  /** Fallback si el contacto de HubSpot no tiene nombre/apellidos. */
  legalRepresentative?: string;
  /** Fallback si el contacto de HubSpot no tiene doc_identificacion. */
  dniLegalRepresentative?: string;
  /** Fallback si el contacto de HubSpot no tiene country (país de origen del cliente). */
  country?: string;
  /** Acuerdo comercial — se envía tal cual al tab Commercial_Agreement del template. */
  commercialAgreement?: string;
}

export interface SendFromTemplateResult {
  envelopeId: string;
  status: string;
  recipientEmail: string;
}

export interface VoidEnvelopeInput {
  envelopeId: string;
  dealId: string;
  reason: string;
}

export interface EnvelopesService {
  sendFromTemplate(input: SendFromTemplateInput): Promise<SendFromTemplateResult>;
  voidEnvelope(input: VoidEnvelopeInput): Promise<void>;
}

export interface EnvelopesServiceDeps {
  hubspot: HubSpotAdapter;
  docusign: DocusignAdapter;
  templateMapping: TemplateMappingResolver;
  templateRoles: TemplateRolesResolver;
  portalId: string;
}

async function resolveCliente(
  hubspot: HubSpotAdapter,
  chosen: Contact,
  dealId: string
): Promise<Contact> {
  const juridicoIds = await hubspot.findJuridicoContactIds(dealId);
  if (juridicoIds.length > 1) {
    throw new ValidationError(
      'CLIENTE_MULTIPLE_JURIDICO',
      `El Deal ${dealId} tiene ${juridicoIds.length} contactos con label responsable_jurídico; sólo se admite uno`,
      { dealId, juridicoIds }
    );
  }
  const clienteId = juridicoIds[0] ?? chosen.id;
  const cliente = clienteId === chosen.id ? chosen : await hubspot.getContactById(clienteId);
  if (!cliente.email) {
    throw new ValidationError(
      'CLIENTE_EMAIL_MISSING',
      `El contacto cliente ${cliente.id} no tiene email — DocuSign lo necesita para enviar`,
      { dealId, contactId: cliente.id }
    );
  }
  return cliente;
}

function selectDireccion(
  direcciones: Direccion[],
  requestedId: string | undefined
): Direccion | null {
  if (requestedId) {
    const found = direcciones.find((d) => d.id === requestedId);
    if (!found) {
      throw new ValidationError(
        'DIRECTION_NOT_IN_COMPANY',
        `La dirección ${requestedId} no pertenece a la Company del Deal`,
        { directionId: requestedId }
      );
    }
    return found;
  }
  return direcciones[0] ?? null;
}

function assertUniqueRecipientEmails(emails: Array<{ role: string; email: string }>): void {
  const seen = new Map<string, string>();
  for (const { role, email } of emails) {
    const key = email.toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      throw new ValidationError(
        'DUPLICATE_RECIPIENT_EMAIL',
        `Dos firmantes (${previous} y ${role}) tienen el mismo email. No se permite.`,
        { rolesConflicting: [previous, role], email }
      );
    }
    seen.set(key, role);
  }
}

export function createEnvelopesService(deps: EnvelopesServiceDeps): EnvelopesService {
  return {
    async sendFromTemplate(input: SendFromTemplateInput): Promise<SendFromTemplateResult> {
      const dealProps = await deps.hubspot.getDealProperties(input.dealId, ['docusign_latest_status']);
      const currentStatus = dealProps.docusign_latest_status ?? '';
      if (currentStatus === 'sent' || currentStatus === 'signing') {
        throw new ConflictError(
          'ACTIVE_ENVELOPE_EXISTS',
          `Hay un contrato activo (estado: ${currentStatus}). Cancélalo o espera a que se complete.`,
          { dealId: input.dealId, currentStatus }
        );
      }

      const contacts = await deps.hubspot.getDealContacts(input.dealId);
      if (contacts.length === 0) {
        throw new NotFoundError(
          'NO_CONTACTS_FOR_DEAL',
          `El Deal ${input.dealId} no tiene contactos asociados con email`,
          { dealId: input.dealId }
        );
      }

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

      const owner = await deps.hubspot.getDealOwner(input.dealId);

      const proveedorConfig = deps.templateRoles.getProveedorConfig(input.templateId);
      if (!proveedorConfig) {
        throw new ValidationError(
          'PROVEEDOR_NOT_CONFIGURED',
          `No hay proveedor configurado para el template ${input.templateId} (revisa TEMPLATE_PROVEEDOR_MAP)`,
          { templateId: input.templateId }
        );
      }

      const proveedor = await deps.hubspot.getContactById(proveedorConfig.contactId);
      if (!proveedor.email) {
        throw new ValidationError(
          'PROVEEDOR_EMAIL_MISSING',
          `El contacto proveedor ${proveedor.id} no tiene email — DocuSign lo necesita para enviar`,
          { templateId: input.templateId, contactId: proveedor.id }
        );
      }

      const cliente = await resolveCliente(deps.hubspot, chosen, input.dealId);

      const [company, capex, quote] = await Promise.all([
        deps.hubspot.getDealPrimaryCompany(input.dealId),
        deps.hubspot.getDealCapex(input.dealId),
        deps.hubspot.getDealLatestQuote(input.dealId),
      ]);

      const direcciones = await deps.hubspot.getCompanyDirecciones(company.id);
      selectDireccion(direcciones, input.directionId);

      assertUniqueRecipientEmails([
        { role: 'Propietario', email: owner.email },
        { role: 'Proveedor', email: proveedor.email },
        { role: 'Cliente', email: cliente.email },
      ]);

      // Representante legal: HubSpot primero, request body como fallback.
      const legalRepresentative =
        `${cliente.firstName} ${cliente.lastName}`.trim() ||
        input.legalRepresentative?.trim() ||
        '';
      const dniLegalRepresentative =
        cliente.docIdentificacion || input.dniLegalRepresentative?.trim() || '';

      const missingLegalData = [
        ...(legalRepresentative ? [] : ['legalRepresentative']),
        ...(dniLegalRepresentative ? [] : ['dniLegalRepresentative']),
      ];
      if (missingLegalData.length > 0) {
        throw new ValidationError(
          'CLIENTE_LEGAL_DATA_MISSING',
          `Faltan datos del representante legal (${missingLegalData.join(', ')}) — no vienen del contacto en HubSpot ni del request. No se puede generar el contrato.`,
          { dealId: input.dealId, contactId: cliente.id, missing: missingLegalData }
        );
      }

      const ctx: ResolutionContext = {
        templateId: input.templateId,
        company: { razonSocial: company.razonSocial, pais: company.pais },
        contactoLegal: {
          fullName: legalRepresentative,
          dni: dniLegalRepresentative,
          pais: cliente.pais || input.country?.trim() || '',
        },
        proveedorCountry: proveedorConfig.country,
        location: input.location ?? '',
        commercialAgreement: input.commercialAgreement ?? '',
        sentDate: toISODate().replace(/-/g, '/'),
        capex: capex.map((c) => ({
          codigo_qr: c.codigo_qr,
          nombre: c.nombre,
          cantidad: c.cantidad,
          costoNeto: c.costoNeto,
        })),
        quote: { hsQuoteLink: quote.hsQuoteLink },
      };

      const tabs = deps.templateMapping.resolveTabValues(ctx);

      const proveedorName = `${proveedor.firstName} ${proveedor.lastName}`.trim();
      const clienteName = `${cliente.firstName} ${cliente.lastName}`.trim() || legalRepresentative;

      const { envelopeId, status } = await deps.docusign.sendEnvelopeFromTemplate({
        templateId: input.templateId,
        roles: [
         /* {
            roleName: 'Propietario',
            name: owner.name,
            email: owner.email,
            routingOrder: 1,
            tabs,
          },*/
          {
            roleName: 'Proveedor',
            name: proveedorName,
            email: proveedor.email,
            routingOrder: 1,
            // TODO: reemplazar hardcode por dato de HubSpot (company.razonSocial)
            tabs: { ...tabs, company: 'Smarteam Test' },
          },
          {
            roleName: 'Cliente',
            name: clienteName,
            email: cliente.email,
            routingOrder: 2,
          },
        ],
        customFields: {
          hubspot_deal_id: input.dealId,
          hubspot_portal_id: deps.portalId
        },
      });

      await deps.hubspot.updateDealProperties(input.dealId, {
        docusign_latest_envelope_id: envelopeId,
        docusign_latest_status: 'sent',
        docusign_latest_sent_at: toISODate(),
        docusign_latest_pdf_url: '',
        docusign_latest_signed_at: '',
      });

      await deps.hubspot.createNoteForDeal({
        dealId: input.dealId,
        body: `<p>Enviado para firma. Envelope: ${envelopeId}. Firmantes: ${owner.name} → ${proveedorName} → ${clienteName}</p>`,
        contactIds: [proveedor.id, cliente.id],
      });

      return {
        envelopeId,
        status,
        recipientEmail: proveedor.email,
      };
    },

    async voidEnvelope(input: VoidEnvelopeInput): Promise<void> {
      const currentStatus = await deps.docusign.getEnvelopeStatus(input.envelopeId);

      if (currentStatus === 'voided') return;

      const terminals = ['completed', 'declined'];
      if (terminals.includes(currentStatus)) {
        throw new ConflictError(
          'ENVELOPE_ALREADY_COMPLETED',
          `El contrato ya cambió a estado "${currentStatus}". Refresca la página.`,
          { envelopeId: input.envelopeId, currentStatus }
        );
      }

      await deps.docusign.voidEnvelope(input.envelopeId, input.reason);

      await deps.hubspot.updateDealProperties(input.dealId, {
        docusign_latest_status: 'voided',
      });

      await deps.hubspot.createNoteForDeal({
        dealId: input.dealId,
        body: `<p>Contrato cancelado por el vendedor. Razón: ${input.reason}</p>`,
      });
    },
  };
}
