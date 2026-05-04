import { describe, expect, jest, test } from '@jest/globals';
import { createEnvelopesService } from '../envelopes.service.js';
import type {
  DocusignAdapter,
  TemplateSummary,
} from '../../integrations/Docusign/index.js';
import type { Contact, HubSpotAdapter } from '../../integrations/HS/index.js';
import type { TemplateMappingResolver } from '../../lib/template-mapping/index.js';
import {
  NotFoundError,
  ExternalServiceError,
} from '../../lib/errors/index.js';

const ada: Contact = {
  id: 'c-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@math.org',
};

const grace: Contact = {
  id: 'c-grace',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@navy.mil',
};

function makeFakeHubspot(contacts: Contact[] = [ada, grace]): HubSpotAdapter {
  return {
    getDealContacts: jest
      .fn<HubSpotAdapter['getDealContacts']>()
      .mockResolvedValue(contacts),
    getContactDetails: jest
      .fn<HubSpotAdapter['getContactDetails']>()
      .mockResolvedValue({ id: 'stub', identification: 'stub', country: 'stub' }),
    getDeal: jest
      .fn<HubSpotAdapter['getDeal']>()
      .mockResolvedValue({ id: 'stub', currencyCode: 'USD' }),
    getDealPrimaryCompany: jest
      .fn<HubSpotAdapter['getDealPrimaryCompany']>()
      .mockResolvedValue({ id: 'stub', name: 'stub', country: 'stub', address: 'stub' }),
    getDealLineItem: jest
      .fn<HubSpotAdapter['getDealLineItem']>()
      .mockResolvedValue({ id: 'stub', name: 'stub', sku: 'stub', price: 'stub' }),
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
  test('happy path: uses chosen contact, composes hubspot + docusign + mapping', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const templateMapping = makeFakeMapping();

    const service = createEnvelopesService({ hubspot, docusign, templateMapping });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(result).toEqual({
      envelopeId: 'env-123',
      status: 'sent',
      recipientEmail: 'ada@math.org',
    });

    expect(hubspot.getDealContacts).toHaveBeenCalledWith('12345');
    expect(docusign.getFirstRoleName).toHaveBeenCalledWith('tpl-abc');
    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
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

  test('throws NO_CONTACTS_FOR_DEAL when adapter returns empty list', async () => {
    const hubspot = makeFakeHubspot([]);
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl-abc',
        contactId: 'c-ada',
      })
    ).rejects.toMatchObject({ code: 'NO_CONTACTS_FOR_DEAL', httpStatus: 404 });
  });

  test('throws CONTACT_NOT_IN_DEAL when contactId is not in the list', async () => {
    const hubspot = makeFakeHubspot([ada, grace]);
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl-abc',
        contactId: 'c-stranger',
      })
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_IN_DEAL', httpStatus: 422 });
  });

  test('propagates DEAL_NOT_FOUND from hubspot.getDealContacts', async () => {
    const hubspot: HubSpotAdapter = {
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockRejectedValue(new NotFoundError('DEAL_NOT_FOUND', 'no existe', undefined)),
      getContactDetails: jest
        .fn<HubSpotAdapter['getContactDetails']>()
        .mockResolvedValue({ id: 'stub', identification: 'stub', country: 'stub' }),
      getDeal: jest
        .fn<HubSpotAdapter['getDeal']>()
        .mockResolvedValue({ id: 'stub', currencyCode: 'USD' }),
      getDealPrimaryCompany: jest
        .fn<HubSpotAdapter['getDealPrimaryCompany']>()
        .mockResolvedValue({ id: 'stub', name: 'stub', country: 'stub', address: 'stub' }),
      getDealLineItem: jest
        .fn<HubSpotAdapter['getDealLineItem']>()
        .mockResolvedValue({ id: 'stub', name: 'stub', sku: 'stub', price: 'stub' }),
    };
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '99', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_NOT_FOUND', httpStatus: 404 });
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
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl-bad', contactId: 'c-ada' })
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
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DOCUSIGN_UNAVAILABLE', httpStatus: 502 });
  });

  test('throws CONTACT_EMAIL_MISSING (defensive) if chosen contact has empty email', async () => {
    const noEmail: Contact = { id: 'c-ghost', firstName: 'Ghost', lastName: '', email: '' };
    // Bypass the adapter's filter by injecting the contact directly via the fake.
    const hubspot = makeFakeHubspot([noEmail]);
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ghost' })
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_MISSING', httpStatus: 422 });
  });
});
