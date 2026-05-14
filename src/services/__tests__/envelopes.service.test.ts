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
  DealOwner,
  HubSpotAdapter,
  LineItem,
} from '../../integrations/HS/index.js';
import type { TemplateMappingResolver } from '../../lib/template-mapping/index.js';
import type { TemplateRolesResolver } from '../../lib/template-roles/index.js';
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
  docIdentificacion: 'CC-12345',
};

const grace: Contact = {
  id: 'c-grace',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@navy.mil',
  docIdentificacion: '',
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
  razonSocial: 'ACME Inc',
  pais: 'Colombia',
};

const fullLineItem: LineItem = {
  id: 'li-1',
  name: 'Producto X',
  sku: 'SKU-001',
  price: '1000',
};

const dealOwner: DealOwner = {
  id: 'owner-55555',
  name: 'Carlos Owner',
  email: 'carlos@empresa.co',
};

const proveedorContact: Contact = {
  id: 'c-proveedor',
  firstName: 'María',
  lastName: 'Gómez',
  email: 'maria@proveedor.co',
  docIdentificacion: '',
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
    getDealOwner: jest
      .fn<HubSpotAdapter['getDealOwner']>()
      .mockResolvedValue(dealOwner),
    getContactById: jest
      .fn<HubSpotAdapter['getContactById']>()
      .mockResolvedValue(proveedorContact),
    ...overrides,
  };
}

function makeFakeDocusign(overrides: Partial<DocusignAdapter> = {}): DocusignAdapter {
  return {
    listTemplates: jest
      .fn<() => Promise<TemplateSummary[]>>()
      .mockResolvedValue([]),
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

function makeFakeTemplateRoles(
  overrides: Partial<TemplateRolesResolver> = {}
): TemplateRolesResolver {
  return {
    getProveedorContactId: jest
      .fn<TemplateRolesResolver['getProveedorContactId']>()
      .mockReturnValue('c-proveedor'),
    ...overrides,
  };
}

describe('envelopes.service', () => {
  test('happy path: 3 firmantes Propietario→Proveedor→Cliente con tabs en Propietario', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const templateMapping = makeFakeMapping();
    const templateRoles = makeFakeTemplateRoles();

    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping,
      templateRoles,
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(result).toEqual({
      envelopeId: 'env-123',
      status: 'sent',
      recipientEmail: 'maria@proveedor.co',
    });

    expect(hubspot.getDealContacts).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealOwner).toHaveBeenCalledWith('12345');
    expect(hubspot.getContactById).toHaveBeenCalledWith('c-proveedor');
    expect(hubspot.getContactDetails).toHaveBeenCalledWith('c-ada');
    expect(hubspot.getDeal).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealPrimaryCompany).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealLineItem).toHaveBeenCalledWith('12345');
    expect(templateRoles.getProveedorContactId).toHaveBeenCalledWith('tpl-abc');

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
      roles: [
        {
          roleName: 'Propietario',
          name: 'Carlos Owner',
          email: 'carlos@empresa.co',
          routingOrder: 1,
          tabs: fullTabs,
        },
        {
          roleName: 'Proveedor',
          name: 'María Gómez',
          email: 'maria@proveedor.co',
          routingOrder: 2,
        },
        {
          roleName: 'Cliente',
          name: 'Ada Lovelace',
          email: 'ada@math.org',
          routingOrder: 3,
        },
      ],
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
      templateRoles: makeFakeTemplateRoles(),
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
      templateRoles: makeFakeTemplateRoles(),
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
      templateRoles: makeFakeTemplateRoles(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '99', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_NOT_FOUND', httpStatus: 404 });
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
      templateRoles: makeFakeTemplateRoles(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DOCUSIGN_UNAVAILABLE', httpStatus: 502 });
  });

  test('throws CONTACT_EMAIL_MISSING (defensive) if chosen contact has empty email', async () => {
    const noEmail: Contact = {
      id: 'c-ghost', firstName: 'Ghost', lastName: '', email: '', docIdentificacion: '',
    };
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([noEmail]),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ghost' })
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_MISSING', httpStatus: 422 });
  });

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
      templateRoles: makeFakeTemplateRoles(),
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
      templateRoles: makeFakeTemplateRoles(),
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_HAS_NO_COMPANY', httpStatus: 422 });

    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('no lanza cuando el resolver devuelve campos vacíos (tolerancia field-level v2)', async () => {
    const templateMapping = makeFakeMapping({
      resolveTabValues: jest
        .fn<TemplateMappingResolver['resolveTabValues']>()
        .mockReturnValue({
          ...fullTabs,
          NumeroIdentificacionComodatario: '',
          DireccionEmpresaComodatario: '',
          SkuProducto: '   ',
        }),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl',
      contactId: 'c-ada',
    });

    expect(result.envelopeId).toBeDefined();
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);

    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.arrayContaining([
          expect.objectContaining({
            roleName: 'Propietario',
            tabs: expect.objectContaining({
              NumeroIdentificacionComodatario: '',
              DireccionEmpresaComodatario: '',
              SkuProducto: '   ',
            }),
          }),
        ]),
      })
    );
  });

  test('happy path consulta las 4 fetches paralelas y las 2 fetches previas (owner + proveedor)', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(hubspot.getDealOwner).toHaveBeenCalledTimes(1);
    expect(hubspot.getContactById).toHaveBeenCalledTimes(1);
    expect(hubspot.getContactDetails).toHaveBeenCalledTimes(1);
    expect(hubspot.getDeal).toHaveBeenCalledTimes(1);
    expect(hubspot.getDealPrimaryCompany).toHaveBeenCalledTimes(1);
    expect(hubspot.getDealLineItem).toHaveBeenCalledTimes(1);
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);
  });

  // ─── New tests for Plan 8 / F2 ─────────────────────────────────────────

  test('lanza DEAL_OWNER_MISSING cuando el deal no tiene propietario', async () => {
    const hubspot = makeFakeHubspot({
      getDealOwner: jest
        .fn<HubSpotAdapter['getDealOwner']>()
        .mockRejectedValue(new ValidationError('DEAL_OWNER_MISSING', '...', undefined)),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_OWNER_MISSING', httpStatus: 422 });
  });

  test('lanza OWNER_EMAIL_MISSING cuando el owner no tiene email', async () => {
    const hubspot = makeFakeHubspot({
      getDealOwner: jest
        .fn<HubSpotAdapter['getDealOwner']>()
        .mockRejectedValue(new ValidationError('OWNER_EMAIL_MISSING', '...', undefined)),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'OWNER_EMAIL_MISSING', httpStatus: 422 });
  });

  test('lanza PROVEEDOR_NOT_CONFIGURED cuando el templateId no está en el mapa', async () => {
    const templateRoles = makeFakeTemplateRoles({
      getProveedorContactId: jest
        .fn<TemplateRolesResolver['getProveedorContactId']>()
        .mockReturnValue(undefined),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles,
    });
    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl-sin-config',
        contactId: 'c-ada',
      })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_NOT_CONFIGURED', httpStatus: 422 });
  });

  test('lanza PROVEEDOR_CONTACT_NOT_FOUND cuando el contacto proveedor no existe en HubSpot', async () => {
    const hubspot = makeFakeHubspot({
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        .mockRejectedValue(
          new ValidationError('PROVEEDOR_CONTACT_NOT_FOUND', '...', undefined)
        ),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_CONTACT_NOT_FOUND', httpStatus: 422 });
  });

  test('lanza PROVEEDOR_EMAIL_MISSING cuando el proveedor no tiene email', async () => {
    const hubspot = makeFakeHubspot({
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        .mockResolvedValue({
          id: 'c-prov', firstName: 'María', lastName: 'G', email: '', docIdentificacion: '',
        }),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_EMAIL_MISSING', httpStatus: 422 });
  });
});
