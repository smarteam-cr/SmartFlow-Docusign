import { describe, expect, jest, test } from '@jest/globals';
import { createEnvelopesService } from '../envelopes.service.js';
import type {
  DocusignAdapter,
  TemplateSummary,
} from '../../integrations/Docusign/index.js';
import type {
  Contact,
  ContactDetails,
  Company,
  DealSummary,
  HubSpotAdapter,
  LineItem,
} from '../../integrations/HS/index.js';
import type { TemplateMappingResolver } from '../../lib/template-mapping/index.js';
import {
  NotFoundError,
  ValidationError,
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

const adaDetails: ContactDetails = {
  id: 'c-ada',
  identification: 'CC-12345',
  country: 'Colombia',
};

const fullDeal: DealSummary = {
  id: '12345',
  currencyCode: 'USD',
};

const fullCompany: Company = {
  id: 'co-1',
  name: 'ACME Inc',
  country: 'Colombia',
  address: 'Calle 100 #5-30',
};

const fullLineItem: LineItem = {
  id: 'li-1',
  name: 'Producto X',
  sku: 'SKU-001',
  price: '1000',
};

function makeFakeHubspot(overrides: Partial<HubSpotAdapter> = {}): HubSpotAdapter {
  return {
    getDealContacts: jest
      .fn<HubSpotAdapter['getDealContacts']>()
      .mockResolvedValue([ada, grace]),
    getContactDetails: jest
      .fn<HubSpotAdapter['getContactDetails']>()
      .mockResolvedValue(adaDetails),
    getDeal: jest
      .fn<HubSpotAdapter['getDeal']>()
      .mockResolvedValue(fullDeal),
    getDealPrimaryCompany: jest
      .fn<HubSpotAdapter['getDealPrimaryCompany']>()
      .mockResolvedValue(fullCompany),
    getDealLineItem: jest
      .fn<HubSpotAdapter['getDealLineItem']>()
      .mockResolvedValue(fullLineItem),
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

const fullTabs: Record<string, string> = {
  Nombre: 'Ada',
  Apellido: 'Lovelace',
  NumeroIdentificacionComodatario: 'CC-12345',
  PaisContactoComodatario: 'Colombia',
  EmpresaComodatario: 'ACME Inc',
  PaisEmpresaComodatario: 'Colombia',
  DireccionEmpresaComodatario: 'Calle 100 #5-30',
  NombreProducto: 'Producto X',
  SkuProducto: 'SKU-001',
  PrecioProducto: '1000',
  Moneda: 'USD',
};

function makeFakeMapping(
  overrides: Partial<TemplateMappingResolver> = {}
): TemplateMappingResolver {
  return {
    resolveTabValues: jest
      .fn<TemplateMappingResolver['resolveTabValues']>()
      .mockReturnValue(fullTabs),
    ...overrides,
  };
}

describe('envelopes.service', () => {
  test('happy path: composes hubspot + docusign + mapping with 11 tabs', async () => {
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
    expect(hubspot.getContactDetails).toHaveBeenCalledWith('c-ada');
    expect(hubspot.getDeal).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealPrimaryCompany).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealLineItem).toHaveBeenCalledWith('12345');
    expect(docusign.getFirstRoleName).toHaveBeenCalledWith('tpl-abc');

    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@math.org' },
      contactDetails: { identification: 'CC-12345', country: 'Colombia' },
      company: { name: 'ACME Inc', country: 'Colombia', address: 'Calle 100 #5-30' },
      lineItem: { name: 'Producto X', sku: 'SKU-001', price: '1000' },
      dealCurrencyCode: 'USD',
    });

    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      signer: {
        name: 'Ada Lovelace',
        email: 'ada@math.org',
        roleName: 'Signer 1',
      },
      prefillTabs: fullTabs,
    });
  });

  test('throws NO_CONTACTS_FOR_DEAL when contact list is empty', async () => {
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([]),
    });
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
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
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
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockRejectedValue(new NotFoundError('DEAL_NOT_FOUND', 'no existe', undefined)),
    });
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
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([noEmail]),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ghost' })
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_MISSING', httpStatus: 422 });
  });

  // ─── New tests for Plan 6 ─────────────────────────────────────────────

  test('propagates DEAL_LINE_ITEMS_INVALID when adapter throws (0 line items)', async () => {
    const hubspot = makeFakeHubspot({
      getDealLineItem: jest
        .fn<HubSpotAdapter['getDealLineItem']>()
        .mockRejectedValue(
          new ValidationError('DEAL_LINE_ITEMS_INVALID', '0 encontrados', undefined)
        ),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_LINE_ITEMS_INVALID', httpStatus: 422 });

    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('propagates DEAL_HAS_NO_COMPANY when Deal has no primary company', async () => {
    const hubspot = makeFakeHubspot({
      getDealPrimaryCompany: jest
        .fn<HubSpotAdapter['getDealPrimaryCompany']>()
        .mockRejectedValue(
          new ValidationError('DEAL_HAS_NO_COMPANY', 'sin primary', undefined)
        ),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_HAS_NO_COMPANY', httpStatus: 422 });

    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('throws MISSING_REQUIRED_FIELD when one tab value is empty (identification)', async () => {
    const templateMapping = makeFakeMapping({
      resolveTabValues: jest
        .fn<TemplateMappingResolver['resolveTabValues']>()
        .mockReturnValue({
          ...fullTabs,
          NumeroIdentificacionComodatario: '',
        }),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping,
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
      httpStatus: 422,
      details: { missingFields: ['NumeroIdentificacionComodatario'] },
    });

    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('MISSING_REQUIRED_FIELD lists all empty tabs in iteration order', async () => {
    const templateMapping = makeFakeMapping({
      resolveTabValues: jest
        .fn<TemplateMappingResolver['resolveTabValues']>()
        .mockReturnValue({
          ...fullTabs,
          DireccionEmpresaComodatario: '',
          SkuProducto: '   ', // whitespace-only also counts as empty
        }),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
      httpStatus: 422,
      details: { missingFields: ['DireccionEmpresaComodatario', 'SkuProducto'] },
    });
  });

  test('happy path actually consults all 5 parallel fetches before sending', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(hubspot.getContactDetails).toHaveBeenCalledTimes(1);
    expect(hubspot.getDeal).toHaveBeenCalledTimes(1);
    expect(hubspot.getDealPrimaryCompany).toHaveBeenCalledTimes(1);
    expect(hubspot.getDealLineItem).toHaveBeenCalledTimes(1);
    expect(docusign.getFirstRoleName).toHaveBeenCalledTimes(1);
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);
  });
});
