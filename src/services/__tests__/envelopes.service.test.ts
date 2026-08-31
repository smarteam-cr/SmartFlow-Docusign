import { describe, expect, jest, test } from '@jest/globals';
import { createEnvelopesService } from '../envelopes.service.js';
import type {
  DocusignAdapter,
  TemplateSummary,
} from '../../integrations/Docusign/index.js';
import type {
  Capex,
  Company,
  Contact,
  DealOwner,
  Direccion,
  HubSpotAdapter,
  Quote,
} from '../../integrations/HS/index.js';
import type { TemplateMappingResolver } from '../../lib/template-mapping/index.js';
import type {
  TemplateRolesConfig,
  TemplateRolesResolver,
} from '../../lib/template-roles/index.js';
import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  ConflictError,
} from '../../lib/errors/index.js';

const ada: Contact = {
  id: 'c-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@math.org',
  docIdentificacion: 'CC-12345',
  pais: 'Costa Rica',
};

const grace: Contact = {
  id: 'c-grace',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@navy.mil',
  docIdentificacion: 'CC-99999',
  pais: '',
};

const fullCompany: Company = {
  id: 'co-1',
  razonSocial: 'SIGMA ALIMENTOS',
  direccionFiscal: '',
  pais: 'MX',
};

const fullCapex: Capex[] = [
  {
    id: 'cx-1',
    codigo_qr: 'Q-A',
    nombre: 'Equipo A',
    cantidad: '1',
    costoNeto: '100',
    hsCreatedate: '2026-01-01',
  },
];

const direccionA: Direccion = { id: 'dir-A', direction: 'Calle A' };
const direccionB: Direccion = { id: 'dir-B', direction: 'Calle B' };

const fullQuote: Quote = { id: 'q-1', hsQuoteLink: 'https://hubspot.com/q1' };

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
  pais: '',
};

const cmContact: Contact = {
  id: 'c-cm',
  firstName: 'Laura',
  lastName: 'Managera',
  email: 'laura@empresa.co',
  docIdentificacion: '',
  pais: '',
};

const legalContact: Contact = {
  id: 'c-legal',
  firstName: 'Jancy',
  lastName: 'Legal',
  email: 'jancy@empresa.co',
  docIdentificacion: '',
  pais: '',
};

const dealSupervisor: DealOwner = {
  id: 'owner-18811253',
  name: 'Jessica Gonzalez',
  email: 'jessica@empresa.co',
};

const rolesConfig: TemplateRolesConfig = {
  recordId: 'pdc-1',
  country: 'España',
  rawCountry: 'España',
  proveedorContactId: 'c-proveedor',
  cmContactId: 'c-cm',
  legalContactId: 'c-legal',
};

/**
 * getContactById resuelto por id (proveedor, CM, Legal y los extra que pase el
 * test). Evita depender del orden de las llamadas dentro del service.
 */
function makeGetContactById(extra: Contact[] = []) {
  const all = [proveedorContact, cmContact, legalContact, ...extra];
  return jest.fn<HubSpotAdapter['getContactById']>(async (contactId: string) => {
    const found = all.find((c) => c.id === contactId);
    if (!found) {
      throw new ValidationError(
        'PROVEEDOR_CONTACT_NOT_FOUND',
        `no existe ${contactId}`,
        undefined
      );
    }
    return found;
  });
}

function makeFakeHubspot(overrides: Partial<HubSpotAdapter> = {}): HubSpotAdapter {
  const fake: HubSpotAdapter = {
    getDealContacts: jest
      .fn<HubSpotAdapter['getDealContacts']>()
      .mockResolvedValue([ada, grace]),
    getDealOwner: jest
      .fn<HubSpotAdapter['getDealOwner']>()
      .mockResolvedValue(dealOwner),
    getDealSupervisor: jest
      .fn<HubSpotAdapter['getDealSupervisor']>()
      .mockResolvedValue(dealSupervisor),
    getParametrosDcByTemplate: jest
      .fn<HubSpotAdapter['getParametrosDcByTemplate']>()
      .mockResolvedValue(null),
    getContactById: makeGetContactById(),
    findJuridicoContactIds: jest
      .fn<HubSpotAdapter['findJuridicoContactIds']>()
      .mockResolvedValue([]),
    getDealPrimaryCompany: jest
      .fn<HubSpotAdapter['getDealPrimaryCompany']>()
      .mockResolvedValue(fullCompany),
    getDealCapex: jest
      .fn<HubSpotAdapter['getDealCapex']>()
      .mockResolvedValue(fullCapex),
    getCompanyDirecciones: jest
      .fn<HubSpotAdapter['getCompanyDirecciones']>()
      .mockResolvedValue([direccionA]),
    getDealLatestQuote: jest
      .fn<HubSpotAdapter['getDealLatestQuote']>()
      .mockResolvedValue(fullQuote),
    updateDealProperties: jest
      .fn<HubSpotAdapter['updateDealProperties']>()
      .mockResolvedValue(undefined),
    createNoteForDeal: jest
      .fn<HubSpotAdapter['createNoteForDeal']>()
      .mockResolvedValue({ noteId: 'n-1' }),
    getDealProperties: jest
      .fn<HubSpotAdapter['getDealProperties']>()
      .mockResolvedValue({}),
    ...overrides,
  };
  return fake;
}

function makeFakeDocusign(overrides: Partial<DocusignAdapter> = {}): DocusignAdapter {
  return {
    listTemplates: jest
      .fn<() => Promise<TemplateSummary[]>>()
      .mockResolvedValue([]),
    sendEnvelopeFromTemplate: jest
      .fn<DocusignAdapter['sendEnvelopeFromTemplate']>()
      .mockResolvedValue({ envelopeId: 'env-123', status: 'sent' }),
    downloadCombinedDocument: jest
      .fn<DocusignAdapter['downloadCombinedDocument']>()
      .mockResolvedValue(Buffer.from('pdf')),
    getEnvelopeStatus: jest
      .fn<DocusignAdapter['getEnvelopeStatus']>()
      .mockResolvedValue('sent'),
    voidEnvelope: jest
      .fn<DocusignAdapter['voidEnvelope']>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}

const stubResolvedTabs: Record<string, string> = {
  country: 'Costa Rica',
  legalRepresentative: 'Ada Lovelace',
  dniLegalRepresentative: 'CC-12345',
  countryINVE: 'España',
  location: '',
  urlQuotation: 'https://hubspot.com/q1',
  datetime: '11/07/2026',
  codeQR_1: 'Q-A', descriptionCapex_1: 'Equipo A', quantity_1: '1', price_1: '100',
  codeQR_2: '', descriptionCapex_2: '', quantity_2: '', price_2: '',
  codeQR_3: '', descriptionCapex_3: '', quantity_3: '', price_3: '',
  codeQR_4: '', descriptionCapex_4: '', quantity_4: '', price_4: '',
  codeQR_5: '', descriptionCapex_5: '', quantity_5: '', price_5: '',
};

function makeFakeMapping(
  overrides: Partial<TemplateMappingResolver> = {}
): TemplateMappingResolver {
  return {
    resolveTabValues: jest
      .fn<TemplateMappingResolver['resolveTabValues']>()
      .mockReturnValue(stubResolvedTabs),
    ...overrides,
  };
}

function makeFakeTemplateRoles(
  overrides: Partial<TemplateRolesResolver> = {},
  config: Partial<TemplateRolesConfig> = {}
): TemplateRolesResolver {
  return {
    getConfig: jest
      .fn<TemplateRolesResolver['getConfig']>()
      .mockResolvedValue({ ...rolesConfig, ...config }),
    ...overrides,
  };
}

describe('envelopes.service — happy paths', () => {
  test('5 firmantes Supervisor→CM→Legal→Proveedor→Cliente, tabs en CM y Proveedor, fallback al contactId del request cuando no hay jurídico', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const templateMapping = makeFakeMapping();
    const templateRoles = makeFakeTemplateRoles();

    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping,
      templateRoles,
      portalId: 'portal-1',
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

    expect(hubspot.findJuridicoContactIds).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealCapex).toHaveBeenCalledWith('12345');
    expect(hubspot.getDealLatestQuote).toHaveBeenCalledWith('12345');
    expect(hubspot.getCompanyDirecciones).toHaveBeenCalledWith('co-1');
    expect(templateRoles.getConfig).toHaveBeenCalledWith('tpl-abc');
    expect(hubspot.getDealSupervisor).toHaveBeenCalledWith('12345');
    expect(hubspot.getContactById).toHaveBeenCalledWith('c-cm');
    expect(hubspot.getContactById).toHaveBeenCalledWith('c-legal');

    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      company: { razonSocial: 'SIGMA ALIMENTOS', pais: 'MX' },
      contactoLegal: {
        fullName: 'Ada Lovelace',
        dni: 'CC-12345',
        pais: 'Costa Rica',
      },
      proveedorCountry: 'España',
      location: '',
      commercialAgreement: '',
      direccionFiscal: '',
      exclusiveUse: '',
      sentDate: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
      capex: [{ codigo_qr: 'Q-A', nombre: 'Equipo A', cantidad: '1', costoNeto: '100' }],
      quote: { hsQuoteLink: 'https://hubspot.com/q1' },
    });

    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      roles: [
        {
          roleName: 'Supervisor',
          name: 'Jessica Gonzalez',
          email: 'jessica@empresa.co',
          routingOrder: 1,
        },
        {
          roleName: 'CM',
          name: 'Laura Managera',
          email: 'laura@empresa.co',
          routingOrder: 2,
          tabs: stubResolvedTabs,
        },
        {
          roleName: 'Legal',
          name: 'Jancy Legal',
          email: 'jancy@empresa.co',
          routingOrder: 3,
        },
        {
          roleName: 'Proveedor',
          name: 'María Gómez',
          email: 'maria@proveedor.co',
          routingOrder: 4,
          tabs: stubResolvedTabs,
        },
        {
          roleName: 'Cliente',
          name: 'Ada Lovelace',
          email: 'ada@math.org',
          routingOrder: 5,
        },
      ],
      customFields: {
        hubspot_deal_id: '12345',
        hubspot_portal_id: 'portal-1',
      },
    });

    expect(hubspot.updateDealProperties).toHaveBeenCalledWith('12345', expect.objectContaining({
      docusign_latest_envelope_id: 'env-123',
      docusign_latest_status: 'sent',
    }));

    expect(hubspot.createNoteForDeal).toHaveBeenCalledWith(expect.objectContaining({
      dealId: '12345',
      contactIds: ['c-cm', 'c-legal', 'c-proveedor', 'c-ada'],
    }));
  });

  test('Proveedor lleva el tab urlQuotation entre los prefillTabs', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    const call = (docusign.sendEnvelopeFromTemplate as jest.Mock).mock
      .calls[0]![0] as { roles: Array<{ roleName: string; tabs?: Record<string, string> }> };
    const proveedor = call.roles.find((r) => r.roleName === 'Proveedor');
    expect(proveedor?.tabs?.urlQuotation).toBe('https://hubspot.com/q1');
    const cm = call.roles.find((r) => r.roleName === 'CM');
    expect(cm?.tabs?.urlQuotation).toBe('https://hubspot.com/q1');
    const cliente = call.roles.find((r) => r.roleName === 'Cliente');
    expect(cliente?.tabs).toBeUndefined();
  });

  test('happy path con 1 jurídico: el contacto Cliente es el jurídico, no el del request', async () => {
    const juridico: Contact = {
      id: 'c-juridico',
      firstName: 'Don',
      lastName: 'Jurídico',
      email: 'juridico@empresa.co',
      docIdentificacion: 'CC-J-999',
      pais: 'Panamá',
    };
    const hubspot = makeFakeHubspot({
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue(['c-juridico']),
      getContactById: makeGetContactById([juridico]),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    const call = (docusign.sendEnvelopeFromTemplate as jest.Mock).mock
      .calls[0]![0] as { roles: Array<{ roleName: string; email: string; name: string }> };
    const cliente = call.roles.find((r) => r.roleName === 'Cliente');
    expect(cliente?.email).toBe('juridico@empresa.co');
    expect(cliente?.name).toBe('Don Jurídico');
  });

  test('directionId válido: no bloquea el envío (solo se valida pertenencia)', async () => {
    const hubspot = makeFakeHubspot({
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([direccionA, direccionB]),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      directionId: 'dir-B',
    });

    expect(result.envelopeId).toBe('env-123');
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);
  });

  test('sin direcciones en la company: no bloquea el envío', async () => {
    const hubspot = makeFakeHubspot({
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([]),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(result.envelopeId).toBe('env-123');
  });

  test('location del request body llega tal cual al contexto del resolver', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      location: 'Bodega 4, San Salvador',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { location: string };
    expect(ctxArg.location).toBe('Bodega 4, San Salvador');
  });

  test('commercialAgreement del request body llega tal cual al contexto del resolver', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      commercialAgreement: 'Acuerdo Marco 2026',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { commercialAgreement: string };
    expect(ctxArg.commercialAgreement).toBe('Acuerdo Marco 2026');
  });

  test('direccionFiscal del request body llega tal cual al contexto del resolver', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      direccionFiscal: 'Av. Central 200, San José',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { direccionFiscal: string };
    expect(ctxArg.direccionFiscal).toBe('Av. Central 200, San José');
  });

  test('exclusiveUse del request body llega tal cual al contexto del resolver', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      exclusiveUse: 'Uso exclusivo oficinas',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { exclusiveUse: string };
    expect(ctxArg.exclusiveUse).toBe('Uso exclusivo oficinas');
  });

  test('fallback: legalRepresentative y dniLegalRepresentative del body cuando HubSpot no los tiene', async () => {
    const sinDatos: Contact = {
      id: 'c-sin-datos',
      firstName: '',
      lastName: '',
      email: 'sindatos@empresa.co',
      docIdentificacion: '',
      pais: '',
    };
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([sinDatos]),
    });
    const templateMapping = makeFakeMapping();
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-sin-datos',
      legalRepresentative: 'Juan Pérez',
      dniLegalRepresentative: '00106808-5',
      country: 'El Salvador',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { contactoLegal: { fullName: string; dni: string; pais: string } };
    expect(ctxArg.contactoLegal.fullName).toBe('Juan Pérez');
    expect(ctxArg.contactoLegal.dni).toBe('00106808-5');
    expect(ctxArg.contactoLegal.pais).toBe('El Salvador');

    const call = (docusign.sendEnvelopeFromTemplate as jest.Mock).mock
      .calls[0]![0] as { roles: Array<{ roleName: string; name: string }> };
    const cliente = call.roles.find((r) => r.roleName === 'Cliente');
    expect(cliente?.name).toBe('Juan Pérez');
  });

  test('HubSpot gana sobre el body cuando ambos traen datos del representante legal', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      legalRepresentative: 'Otro Nombre',
      dniLegalRepresentative: 'OTRO-DNI',
      country: 'Otro País',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { contactoLegal: { fullName: string; dni: string; pais: string } };
    expect(ctxArg.contactoLegal.fullName).toBe('Ada Lovelace');
    expect(ctxArg.contactoLegal.dni).toBe('CC-12345');
    expect(ctxArg.contactoLegal.pais).toBe('Costa Rica');
  });
});

describe('envelopes.service — errores estructurales', () => {
  test('NO_CONTACTS_FOR_DEAL si el deal no tiene contactos con email', async () => {
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
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'NO_CONTACTS_FOR_DEAL', httpStatus: 404 });
  });

  test('CONTACT_NOT_IN_DEAL si el contactId del request no está en el Deal', async () => {
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-stranger' })
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_IN_DEAL', httpStatus: 422 });
  });

  test('CONTACT_EMAIL_MISSING (defensivo) si el chosen contact tiene email vacío', async () => {
    const noEmail: Contact = {
      id: 'c-ghost', firstName: 'Ghost', lastName: '', email: '', docIdentificacion: '', pais: '',
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
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ghost' })
    ).rejects.toMatchObject({ code: 'CONTACT_EMAIL_MISSING', httpStatus: 422 });
  });

  test('DEAL_OWNER_MISSING propagado del adapter', async () => {
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
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_OWNER_MISSING', httpStatus: 422 });
  });

  test('PROVEEDOR_NOT_CONFIGURED cuando el templateId no está mapeado', async () => {
    const templateRoles = makeFakeTemplateRoles({
      getConfig: jest
        .fn<TemplateRolesResolver['getConfig']>()
        .mockResolvedValue(undefined),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles,
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl-sin-config',
        contactId: 'c-ada',
      })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_NOT_CONFIGURED', httpStatus: 422 });
  });

  test('PROVEEDOR_EMAIL_MISSING cuando el contacto proveedor no tiene email', async () => {
    const hubspot = makeFakeHubspot({
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        .mockResolvedValue({
          id: 'c-prov', firstName: 'María', lastName: 'G', email: '', docIdentificacion: '', pais: '',
        }),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_EMAIL_MISSING', httpStatus: 422 });
  });

  test('CLIENTE_MULTIPLE_JURIDICO si hay >1 jurídico', async () => {
    const hubspot = makeFakeHubspot({
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue(['c-j1', 'c-j2']),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'CLIENTE_MULTIPLE_JURIDICO', httpStatus: 422 });
  });

  test('CLIENTE_EMAIL_MISSING cuando el jurídico no tiene email', async () => {
    const juridicoSinEmail: Contact = {
      id: 'c-juridico',
      firstName: 'Don',
      lastName: 'J',
      email: '',
      docIdentificacion: 'X',
      pais: '',
    };
    const hubspot = makeFakeHubspot({
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue(['c-juridico']),
      getContactById: makeGetContactById([juridicoSinEmail]),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'CLIENTE_EMAIL_MISSING', httpStatus: 422 });
  });

  test('CLIENTE_LEGAL_DATA_MISSING cuando ni HubSpot ni el body traen nombre y DNI', async () => {
    const sinDatos: Contact = {
      id: 'c-sin-datos',
      firstName: '',
      lastName: '',
      email: 'sindatos@empresa.co',
      docIdentificacion: '',
      pais: '',
    };
    const hubspot = makeFakeHubspot({
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([sinDatos]),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-sin-datos' })
    ).rejects.toMatchObject({
      code: 'CLIENTE_LEGAL_DATA_MISSING',
      httpStatus: 422,
      details: { missing: ['legalRepresentative', 'dniLegalRepresentative'] },
    });
    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('QUOTE_NOT_FOUND propagado del adapter', async () => {
    const hubspot = makeFakeHubspot({
      getDealLatestQuote: jest
        .fn<HubSpotAdapter['getDealLatestQuote']>()
        .mockRejectedValue(new ValidationError('QUOTE_NOT_FOUND', 'sin quote', undefined)),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND', httpStatus: 422 });
  });

  test('CAPEX_TOO_MANY propagado del adapter', async () => {
    const hubspot = makeFakeHubspot({
      getDealCapex: jest
        .fn<HubSpotAdapter['getDealCapex']>()
        .mockRejectedValue(new ValidationError('CAPEX_TOO_MANY', '7 capex', undefined)),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'CAPEX_TOO_MANY', httpStatus: 422 });
  });

  test('DIRECTION_NOT_IN_COMPANY cuando el directionId del request no pertenece', async () => {
    const hubspot = makeFakeHubspot({
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([direccionA, direccionB]),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl',
        contactId: 'c-ada',
        directionId: 'dir-ZZZ',
      })
    ).rejects.toMatchObject({ code: 'DIRECTION_NOT_IN_COMPANY', httpStatus: 422 });
    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('CM_NOT_CONFIGURED cuando la fila de Parametros DC no tiene cm_id_hubspot_code', async () => {
    const templateRoles = makeFakeTemplateRoles({}, { cmContactId: '' });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles,
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({
        dealId: '12345',
        templateId: 'tpl-sin-cm',
        contactId: 'c-ada',
      })
    ).rejects.toMatchObject({ code: 'CM_NOT_CONFIGURED', httpStatus: 422 });
    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('CM_EMAIL_MISSING cuando el contacto CM no tiene email', async () => {
    const cmSinEmail: Contact = {
      id: 'c-cm-sin-email',
      firstName: 'Laura',
      lastName: 'M',
      email: '',
      docIdentificacion: '',
      pais: '',
    };
    const hubspot = makeFakeHubspot({
      getContactById: makeGetContactById([cmSinEmail]),
    });
    const templateRoles = makeFakeTemplateRoles({}, { cmContactId: 'c-cm-sin-email' });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles,
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'CM_EMAIL_MISSING', httpStatus: 422 });
  });

  test('PROVEEDOR_CONTACT_NOT_FOUND propagado cuando el cm_id_hubspot_code no existe en HubSpot', async () => {
    const templateRoles = makeFakeTemplateRoles({}, { cmContactId: 'c-fantasma' });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles,
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_CONTACT_NOT_FOUND', httpStatus: 422 });
  });

  test('DUPLICATE_RECIPIENT_EMAIL cuando CM y Cliente comparten email', async () => {
    const cmDuplicado: Contact = { ...cmContact, id: 'c-cm-dup', email: 'ADA@math.org' };
    const hubspot = makeFakeHubspot({
      getContactById: makeGetContactById([cmDuplicado]),
    });
    const templateRoles = makeFakeTemplateRoles({}, { cmContactId: 'c-cm-dup' });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles,
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DUPLICATE_RECIPIENT_EMAIL', httpStatus: 422 });
  });

  test('DEAL_NOT_FOUND propagado del primer fetch', async () => {
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
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '99', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_NOT_FOUND', httpStatus: 404 });
  });

  test('DOCUSIGN_UNAVAILABLE propagado del send', async () => {
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
      portalId: 'portal-1',
    });
    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DOCUSIGN_UNAVAILABLE', httpStatus: 502 });
  });

  test('tolerancia field-level: resolver con campos vacíos no bloquea el envío', async () => {
    const emptyTabs = Object.fromEntries(
      Object.keys(stubResolvedTabs).map((k) => [k, ''])
    ) as Record<string, string>;
    const templateMapping = makeFakeMapping({
      resolveTabValues: jest
        .fn<TemplateMappingResolver['resolveTabValues']>()
        .mockReturnValue(emptyTabs),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl',
      contactId: 'c-ada',
    });

    expect(result.envelopeId).toBeDefined();
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('envelopes.service — voidEnvelope', () => {
  test('happy path: status sent → void called → deal updated → note created', async () => {
    const hubspot = makeFakeHubspot();
    const docusign = makeFakeDocusign({
      getEnvelopeStatus: jest
        .fn<DocusignAdapter['getEnvelopeStatus']>()
        .mockResolvedValue('sent'),
      voidEnvelope: jest
        .fn<DocusignAdapter['voidEnvelope']>()
        .mockResolvedValue(undefined),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.voidEnvelope({ envelopeId: 'env-1', dealId: 'd-1', reason: 'Error en datos del contrato' });

    expect(docusign.getEnvelopeStatus).toHaveBeenCalledWith('env-1');
    expect(docusign.voidEnvelope).toHaveBeenCalledWith('env-1', 'Error en datos del contrato');
    expect(hubspot.updateDealProperties).toHaveBeenCalledWith('d-1', {
      docusign_latest_status: 'voided',
    });
    expect(hubspot.createNoteForDeal).toHaveBeenCalledWith(expect.objectContaining({
      dealId: 'd-1',
      body: expect.stringContaining('Error en datos del contrato'),
    }));
  });

  test('idempotent: envelope already voided → returns without error', async () => {
    const docusign = makeFakeDocusign({
      getEnvelopeStatus: jest
        .fn<DocusignAdapter['getEnvelopeStatus']>()
        .mockResolvedValue('voided'),
    });
    const hubspot = makeFakeHubspot();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.voidEnvelope({ envelopeId: 'env-1', dealId: 'd-1', reason: 'Ya cancelado' })
    ).resolves.toBeUndefined();

    expect(docusign.voidEnvelope).not.toHaveBeenCalled();
    expect(hubspot.updateDealProperties).not.toHaveBeenCalled();
  });

  test('409 ENVELOPE_ALREADY_COMPLETED when status is completed', async () => {
    const docusign = makeFakeDocusign({
      getEnvelopeStatus: jest
        .fn<DocusignAdapter['getEnvelopeStatus']>()
        .mockResolvedValue('completed'),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.voidEnvelope({ envelopeId: 'env-1', dealId: 'd-1', reason: 'Quiero cancelar' })
    ).rejects.toMatchObject({ code: 'ENVELOPE_ALREADY_COMPLETED', httpStatus: 409 });
  });

  test('409 ENVELOPE_ALREADY_COMPLETED when status is declined', async () => {
    const docusign = makeFakeDocusign({
      getEnvelopeStatus: jest
        .fn<DocusignAdapter['getEnvelopeStatus']>()
        .mockResolvedValue('declined'),
    });
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.voidEnvelope({ envelopeId: 'env-1', dealId: 'd-1', reason: 'Quiero cancelar' })
    ).rejects.toMatchObject({ code: 'ENVELOPE_ALREADY_COMPLETED', httpStatus: 409 });
  });

});

describe('envelopes.service — 409 stale check on sendFromTemplate', () => {
  test('409 ACTIVE_ENVELOPE_EXISTS when docusign_latest_status is sent', async () => {
    const hubspot = makeFakeHubspot({
      getDealProperties: jest
        .fn<HubSpotAdapter['getDealProperties']>()
        .mockResolvedValue({ docusign_latest_status: 'sent' }),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'ACTIVE_ENVELOPE_EXISTS', httpStatus: 409 });

    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('409 ACTIVE_ENVELOPE_EXISTS when docusign_latest_status is signing', async () => {
    const hubspot = makeFakeHubspot({
      getDealProperties: jest
        .fn<HubSpotAdapter['getDealProperties']>()
        .mockResolvedValue({ docusign_latest_status: 'signing' }),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'ACTIVE_ENVELOPE_EXISTS', httpStatus: 409 });
  });

  test('allows send when docusign_latest_status is signed (terminal)', async () => {
    const hubspot = makeFakeHubspot({
      getDealProperties: jest
        .fn<HubSpotAdapter['getDealProperties']>()
        .mockResolvedValue({ docusign_latest_status: 'signed' }),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(result.envelopeId).toBe('env-123');
    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledTimes(1);
  });

  test('allows send when docusign_latest_status is empty (no prior envelope)', async () => {
    const hubspot = makeFakeHubspot({
      getDealProperties: jest
        .fn<HubSpotAdapter['getDealProperties']>()
        .mockResolvedValue({ docusign_latest_status: '' }),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    const result = await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    expect(result.envelopeId).toBe('env-123');
  });
});

describe('envelopes.service — rol Supervisor (propiedad supervisor del Deal)', () => {
  test('DEAL_SUPERVISOR_MISSING se propaga y no se envía nada a DocuSign', async () => {
    const hubspot = makeFakeHubspot({
      getDealSupervisor: jest
        .fn<HubSpotAdapter['getDealSupervisor']>()
        .mockRejectedValue(
          new ValidationError('DEAL_SUPERVISOR_MISSING', 'sin supervisor', undefined)
        ),
    });
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot,
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DEAL_SUPERVISOR_MISSING', httpStatus: 422 });
    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('DUPLICATE_RECIPIENT_EMAIL cuando el Supervisor comparte email con el CM', async () => {
    const hubspot = makeFakeHubspot({
      getDealSupervisor: jest
        .fn<HubSpotAdapter['getDealSupervisor']>()
        .mockResolvedValue({ id: 'owner-x', name: 'Jessica', email: 'LAURA@empresa.co' }),
    });
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'DUPLICATE_RECIPIENT_EMAIL', httpStatus: 422 });
  });
});

describe('envelopes.service — rol Legal (usuario_legal de Parametros DC)', () => {
  test('LEGAL_NOT_CONFIGURED cuando la fila no tiene usuario_legal', async () => {
    const docusign = makeFakeDocusign();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign,
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles({}, { legalContactId: '   ' }),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'LEGAL_NOT_CONFIGURED', httpStatus: 422 });
    expect(docusign.sendEnvelopeFromTemplate).not.toHaveBeenCalled();
  });

  test('LEGAL_EMAIL_MISSING cuando el contacto Legal no tiene email', async () => {
    const legalSinEmail: Contact = { ...legalContact, id: 'c-legal-sin-email', email: '' };
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot({ getContactById: makeGetContactById([legalSinEmail]) }),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles({}, { legalContactId: 'c-legal-sin-email' }),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'LEGAL_EMAIL_MISSING', httpStatus: 422 });
  });

  test('PROVEEDOR_NOT_CONFIGURED cuando la fila existe pero legal_representative_code está vacío', async () => {
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping: makeFakeMapping(),
      templateRoles: makeFakeTemplateRoles({}, { proveedorContactId: '' }),
      portalId: 'portal-1',
    });

    await expect(
      service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' })
    ).rejects.toMatchObject({ code: 'PROVEEDOR_NOT_CONFIGURED', httpStatus: 422 });
  });

  test('el country normalizado de la fila llega al tab countryINVE vía proveedorCountry', async () => {
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot: makeFakeHubspot(),
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles({}, { country: 'Guatemala', rawCountry: 'Guatemala IV' }),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({ dealId: '12345', templateId: 'tpl', contactId: 'c-ada' });

    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith(
      expect.objectContaining({ proveedorCountry: 'Guatemala' })
    );
  });
});
