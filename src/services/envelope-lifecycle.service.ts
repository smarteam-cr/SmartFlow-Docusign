import type { HubSpotAdapter, HubSpotFilesAdapter } from '../integrations/HS/index.js';
import type { DocusignAdapter } from '../integrations/Docusign/index.js';
import { toISODate } from '../utils/toISODate.js';

export interface EnvelopeEvent {
  eventType: string;
  envelopeId: string;
  dealId: string;
  portalId: string;
  recipientEvents?: Array<{
    email: string;
    status: string;
    recipientId: string;
  }>;
  declinedReason?: string;
  voidedReason?: string;
}

export interface EnvelopeLifecycleService {
  handleEvent(event: EnvelopeEvent): Promise<void>;
}

export interface EnvelopeLifecycleDeps {
  hubspot: HubSpotAdapter;
  hubspotFiles: HubSpotFilesAdapter;
  docusign: DocusignAdapter;
}

export function createEnvelopeLifecycleService(
  deps: EnvelopeLifecycleDeps
): EnvelopeLifecycleService {
  return {
    async handleEvent(event: EnvelopeEvent): Promise<void> {
      if (!event.dealId) return;

      switch (event.eventType) {
        case 'envelope-completed': {
          const filename = `deal-${event.dealId}-${event.envelopeId}.pdf`;

          const existing = await deps.hubspotFiles.findFileByName(filename);
          if (existing) return;

          const pdfBuffer = await deps.docusign.downloadCombinedDocument(event.envelopeId);
          const { fileId } = await deps.hubspotFiles.uploadFile({
            filename,
            buffer: pdfBuffer,
            access: 'PRIVATE',
          });

          const pdfUrl = `https://app.hubspot.com/files/${event.portalId}/file/${fileId}`;

          await deps.hubspot.updateDealProperties(event.dealId, {
            docusign_latest_status: 'signed',
            docusign_latest_pdf_url: pdfUrl,
            docusign_latest_signed_at: toISODate(),
          });

          await deps.hubspot.createNoteForDeal({
            dealId: event.dealId,
            body: `<p>Contrato firmado por todas las partes. Envelope: ${event.envelopeId}</p>`,
            attachmentIds: [fileId],
          });
          break;
        }

        case 'envelope-sent':
          await deps.hubspot.updateDealProperties(event.dealId, {
            docusign_latest_status: 'sent',
          });
          break;

        case 'recipient-completed':
          await deps.hubspot.updateDealProperties(event.dealId, {
            docusign_latest_status: 'signing',
          });
          break;

        case 'envelope-declined':
          await deps.hubspot.updateDealProperties(event.dealId, {
            docusign_latest_status: 'declined',
          });
          await deps.hubspot.createNoteForDeal({
            dealId: event.dealId,
            body: `<p>Contrato rechazado. Razón: ${event.declinedReason ?? 'No especificada'}</p>`,
          });
          break;

        case 'envelope-voided':
          await deps.hubspot.updateDealProperties(event.dealId, {
            docusign_latest_status: 'voided',
          });
          await deps.hubspot.createNoteForDeal({
            dealId: event.dealId,
            body: `<p>Contrato cancelado. Razón: ${event.voidedReason ?? 'No especificada'}</p>`,
          });
          break;

        default:
          break;
      }
    },
  };
}
