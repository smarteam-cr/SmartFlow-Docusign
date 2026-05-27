import { describe, expect, jest, test } from '@jest/globals';
import {
  createEnvelopeStatusService,
  type EnvelopeStatusServiceDeps,
} from '../envelope-status.service.js';
import type { HubSpotAdapter } from '../../integrations/HS/index.js';

function makeFakeDeps(
  overrides?: Partial<EnvelopeStatusServiceDeps>
): EnvelopeStatusServiceDeps {
  return {
    hubspot: {
      getDealProperties: jest
        .fn<HubSpotAdapter['getDealProperties']>()
        .mockResolvedValue({
          docusign_latest_envelope_id: 'env-abc',
          docusign_latest_status: 'sent',
          docusign_latest_sent_at: '2026-05-20',
          docusign_latest_signed_at: '',
          docusign_latest_pdf_url: '',
        }),
    } as unknown as HubSpotAdapter,
    ...overrides,
  };
}

describe('EnvelopeStatusService.getStatus', () => {
  test('deal with active envelope returns full status', async () => {
    const deps = makeFakeDeps();
    const service = createEnvelopeStatusService(deps);

    const result = await service.getStatus('d-1');

    expect(result).toEqual({
      envelopeId: 'env-abc',
      status: 'sent',
      sentAt: '2026-05-20',
      signedAt: null,
      pdfUrl: null,
    });
    expect(deps.hubspot.getDealProperties).toHaveBeenCalledWith('d-1', [
      'docusign_latest_envelope_id',
      'docusign_latest_status',
      'docusign_latest_sent_at',
      'docusign_latest_signed_at',
      'docusign_latest_pdf_url',
    ]);
  });

  test('deal with completed envelope returns signedAt and pdfUrl', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        getDealProperties: jest
          .fn<HubSpotAdapter['getDealProperties']>()
          .mockResolvedValue({
            docusign_latest_envelope_id: 'env-xyz',
            docusign_latest_status: 'signed',
            docusign_latest_sent_at: '2026-05-18',
            docusign_latest_signed_at: '2026-05-20',
            docusign_latest_pdf_url: 'https://app.hubspot.com/file-preview/123',
          }),
      } as unknown as HubSpotAdapter,
    });
    const service = createEnvelopeStatusService(deps);

    const result = await service.getStatus('d-1');

    expect(result).toEqual({
      envelopeId: 'env-xyz',
      status: 'signed',
      sentAt: '2026-05-18',
      signedAt: '2026-05-20',
      pdfUrl: 'https://app.hubspot.com/file-preview/123',
    });
  });

  test('deal without envelope returns status none', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        getDealProperties: jest
          .fn<HubSpotAdapter['getDealProperties']>()
          .mockResolvedValue({
            docusign_latest_envelope_id: '',
            docusign_latest_status: '',
            docusign_latest_sent_at: '',
            docusign_latest_signed_at: '',
            docusign_latest_pdf_url: '',
          }),
      } as unknown as HubSpotAdapter,
    });
    const service = createEnvelopeStatusService(deps);

    const result = await service.getStatus('d-1');

    expect(result).toEqual({
      envelopeId: null,
      status: 'none',
    });
  });
});
