import type { HubSpotAdapter } from '../integrations/HS/index.js';

export interface EnvelopeStatusResult {
  envelopeId: string | null;
  status: string;
  sentAt?: string | null;
  signedAt?: string | null;
  pdfUrl?: string | null;
}

export interface EnvelopeStatusService {
  getStatus(dealId: string): Promise<EnvelopeStatusResult>;
}

export interface EnvelopeStatusServiceDeps {
  hubspot: Pick<HubSpotAdapter, 'getDealProperties'>;
}

const STATUS_PROPERTIES = [
  'docusign_latest_envelope_id',
  'docusign_latest_status',
  'docusign_latest_sent_at',
  'docusign_latest_signed_at',
  'docusign_latest_pdf_url',
] as const;

export function createEnvelopeStatusService(
  deps: EnvelopeStatusServiceDeps
): EnvelopeStatusService {
  return {
    async getStatus(dealId: string): Promise<EnvelopeStatusResult> {
      const props = await deps.hubspot.getDealProperties(dealId, [...STATUS_PROPERTIES]);

      const envelopeId = props.docusign_latest_envelope_id || null;

      if (!envelopeId) {
        return { envelopeId: null, status: 'none' };
      }

      return {
        envelopeId,
        status: props.docusign_latest_status || 'none',
        sentAt: props.docusign_latest_sent_at || null,
        signedAt: props.docusign_latest_signed_at || null,
        pdfUrl: props.docusign_latest_pdf_url || null,
      };
    },
  };
}
