import { describe, expect, jest, test } from '@jest/globals';
import { createTemplatesService } from '../templates.service.js';
import type {
  DocusignAdapter,
  TemplateSummary,
} from '../../integrations/Docusign/index.js';
import { ExternalServiceError } from '../../lib/errors/index.js';

function makeFakeDocusign(overrides: Partial<DocusignAdapter> = {}): DocusignAdapter {
  return {
    listTemplates: jest.fn<() => Promise<TemplateSummary[]>>().mockResolvedValue([]),
    sendEnvelopeFromTemplate: jest
      .fn<DocusignAdapter['sendEnvelopeFromTemplate']>()
      .mockResolvedValue({ envelopeId: 'env-1', status: 'sent' }),
    downloadCombinedDocument: jest
      .fn<DocusignAdapter['downloadCombinedDocument']>()
      .mockResolvedValue(Buffer.from('pdf')),
    ...overrides,
  };
}

describe('templates.service', () => {
  test('list() returns the templates from the DocuSign adapter', async () => {
    const docusign = makeFakeDocusign({
      listTemplates: jest
        .fn<() => Promise<TemplateSummary[]>>()
        .mockResolvedValue([
          { id: 't1', name: 'NDA' },
          { id: 't2', name: 'Contrato' },
        ]),
    });
    const service = createTemplatesService({ docusign });

    const result = await service.list();

    expect(result).toEqual([
      { id: 't1', name: 'NDA' },
      { id: 't2', name: 'Contrato' },
    ]);
    expect(docusign.listTemplates).toHaveBeenCalledTimes(1);
  });

  test('list() propagates ExternalServiceError from the adapter', async () => {
    const docusign = makeFakeDocusign({
      listTemplates: jest
        .fn<() => Promise<TemplateSummary[]>>()
        .mockRejectedValue(
          new ExternalServiceError('DOCUSIGN_UNAVAILABLE', 'down', undefined)
        ),
    });
    const service = createTemplatesService({ docusign });

    await expect(service.list()).rejects.toMatchObject({
      code: 'DOCUSIGN_UNAVAILABLE',
      httpStatus: 502,
    });
  });
});
