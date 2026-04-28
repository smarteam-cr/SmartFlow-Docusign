import { describe, expect, jest, test } from '@jest/globals';
import { createEnvelopesService } from '../envelopes.service.js';
import type {
  DocusignAdapter,
  TemplateSummary,
} from '../../integrations/Docusign/index.js';
import type { HubSpotAdapter } from '../../integrations/HS/index.js';
import type {
  ContactInfo,
  TemplateMappingResolver,
} from '../../lib/template-mapping/index.js';
import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const sampleContact: ContactInfo = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@math.org',
};

function makeFakeHubspot(overrides: Partial<HubSpotAdapter> = {}): HubSpotAdapter {
  return {
    getDealPrimaryContact: jest
      .fn<HubSpotAdapter['getDealPrimaryContact']>()
      .mockResolvedValue(sampleContact),
    ...overrides,
  };
}

function makeFakeDocusign(overrides: Partial<DocusignAdapter> = {}): DocusignAdapter {
  return {
    listTemplates: jest
      .fn<() => Promise<TemplateSummary[]>>()
      .mockResolvedValue([]),
    getFirstRoleName: jest
      .fn<(templateId: string) => Promise<string>>()
      .mockResolvedValue('Signer 1'),
    sendEnvelopeFromTemplate: jest
      .fn<DocusignAdapter['sendEnvelopeFromTemplate']>()
      .mockResolvedValue({ envelopeId: 'env-123', status: 'sent' }),
    ...overrides,
  };
}

function makeFakeMapping(
  overrides: Partial<TemplateMappingResolver> = {}
): TemplateMappingResolver {
  return {
    resolveTabValues: jest
      .fn<TemplateMappingResolver['resolveTabValues']>()
      .mockReturnValue({ Nombre: 'Ada', Apellido: 'Lovelace' }),
    ...overrides,
  };
}

describe('envelopes.service', () => {
  test('happy path: composes hubspot + docusign + mapping correctly', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const templateMapping = makeFakeMapping();

    const service = createEnvelopesService({ hubspot, docusign, templateMapping });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
    });

    expect(result).toEqual({
      envelopeId: 'env-123',
      status: 'sent',
      recipientEmail: 'ada@math.org',
    });

    expect(hubspot.getDealPrimaryContact).toHaveBeenCalledWith('12345');
    expect(docusign.getFirstRoleName).toHaveBeenCalledWith('tpl-abc');
    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      contact: sampleContact,
    });
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      signer: {
        name: 'Ada Lovelace',
        email: 'ada@math.org',
        roleName: 'Signer 1',
      },
      prefillTabs: { Nombre: 'Ada', Apellido: 'Lovelace' },
    });
  });

  test('propagates DEAL_NOT_FOUND from hubspot', async () => {
    const hubspot = makeFakeHubspot({
      getDealPrimaryContact: jest
        .fn<HubSpotAdapter['getDealPrimaryContact']>()
        .mockRejectedValue(new NotFoundError('DEAL_NOT_FOUND', 'no existe', undefined)),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '99', templateId: 'tpl' })
    ).rejects.toMatchObject({ code: 'DEAL_NOT_FOUND', httpStatus: 404 });
  });

  test('propagates CONTACT_EMAIL_MISSING from hubspot', async () => {
    const hubspot = makeFakeHubspot({
      getDealPrimaryContact: jest
        .fn<HubSpotAdapter['getDealPrimaryContact']>()
        .mockRejectedValue(
          new ValidationError('CONTACT_EMAIL_MISSING', 'sin email', undefined)
        ),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl' })
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_MISSING', httpStatus: 422 });
  });

  test('propagates TEMPLATE_NOT_FOUND from docusign.getFirstRoleName', async () => {
    const docusign = makeFakeDocusign({
      getFirstRoleName: jest
        .fn<(templateId: string) => Promise<string>>()
        .mockRejectedValue(new NotFoundError('TEMPLATE_NOT_FOUND', 'no existe', undefined)),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl-bad' })
    ).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND', httpStatus: 404 });
  });

  test('propagates DOCUSIGN_UNAVAILABLE from sendEnvelopeFromTemplate', async () => {
    const docusign = makeFakeDocusign({
      sendEnvelopeFromTemplate: jest
        .fn<DocusignAdapter['sendEnvelopeFromTemplate']>()
        .mockRejectedValue(
          new ExternalServiceError('DOCUSIGN_UNAVAILABLE', 'caído', undefined)
        ),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl' })
    ).rejects.toMatchObject({ code: 'DOCUSIGN_UNAVAILABLE', httpStatus: 502 });
  });
});
