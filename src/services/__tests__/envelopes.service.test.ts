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
import type { TemplateRolesResolver } from '../../lib/template-roles/index.js';
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
};

const grace: Contact = {
  id: 'c-grace',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@navy.mil',
  docIdentificacion: 'CC-99999',
};

const fullCompany: Company = {
  id: 'co-1',
  razonSocial: 'SIGMA ALIMENTOS',
  pais: 'MX',
};

const fullCapex: Capex[] = [
  {
    id: 'cx-1',
    qrCapex: 'Q-A',
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
};

function makeFakeHubspot(overrides: Partial<HubSpotAdapter> = {}): HubSpotAdapter {
  const fake: HubSpotAdapter = {
    getDealContacts: jest
      .fn<HubSpotAdapter['getDealContacts']>()
      .mockResolvedValue([ada, grace]),
    getDealOwner: jest
      .fn<HubSpotAdapter['getDealOwner']>()
      .mockResolvedValue(dealOwner),
    getContactById: jest
      .fn<HubSpotAdapter['getContactById']>()
      .mockResolvedValue(proveedorContact),
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
  RazonSocial: 'SIGMA ALIMENTOS',
  PaisRazonSocial: 'MX',
  NombreCliente: 'Ada',
  ApellidosCliente: 'Lovelace',
  DocIdentCliente: 'CC-12345',
  DirecUbiComodato: 'Calle A',
  '#HREF_UrlCotizacion': 'https://hubspot.com/q1',
  QrCpx1: 'Q-A', NombreCpx1: 'Equipo A', CantidadCpx1: '1', CostoCpx1: '100',
  QrCpx2: '', NombreCpx2: '', CantidadCpx2: '', CostoCpx2: '',
  QrCpx3: '', NombreCpx3: '', CantidadCpx3: '', CostoCpx3: '',
  QrCpx4: '', NombreCpx4: '', CantidadCpx4: '', CostoCpx4: '',
  QrCpx5: '', NombreCpx5: '', CantidadCpx5: '', CostoCpx5: '',
  QrCpx6: '', NombreCpx6: '', CantidadCpx6: '', CostoCpx6: '',
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
  overrides: Partial<TemplateRolesResolver> = {}
): TemplateRolesResolver {
  return {
    getProveedorContactId: jest
      .fn<TemplateRolesResolver['getProveedorContactId']>()
      .mockReturnValue('c-proveedor'),
    ...overrides,
  };
}

describe('envelopes.service — happy paths', () => {
  test('3 firmantes Propietario→Proveedor→Cliente, tabs solo en Propietario, fallback al contactId del request cuando no hay jurídico', async () => {
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
    expect(templateRoles.getProveedorContactId).toHaveBeenCalledWith('tpl-abc');

    expect(templateMapping.resolveTabValues).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      company: { razonSocial: 'SIGMA ALIMENTOS', pais: 'MX' },
      contactoLegal: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        docIdentificacion: 'CC-12345',
      },
      capex: [{ qrCapex: 'Q-A', nombre: 'Equipo A', cantidad: '1', costoNeto: '100' }],
      direccion: { direction: 'Calle A' },
      quote: { hsQuoteLink: 'https://hubspot.com/q1' },
    });

    expect(docusign.sendEnvelopeFromTemplate).toHaveBeenCalledWith({
      templateId: 'tpl-abc',
      roles: [
        {
          roleName: 'Propietario',
          name: 'Carlos Owner',
          email: 'carlos@empresa.co',
          routingOrder: 1,
          tabs: stubResolvedTabs,
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
      contactIds: ['c-proveedor', 'c-ada'],
    }));
  });

  test('Propietario lleva el tab #HREF_UrlCotizacion entre los prefillTabs', async () => {
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
    const propietario = call.roles.find((r) => r.roleName === 'Propietario');
    expect(propietario?.tabs?.['#HREF_UrlCotizacion']).toBe('https://hubspot.com/q1');
    const proveedor = call.roles.find((r) => r.roleName === 'Proveedor');
    expect(proveedor?.tabs).toBeUndefined();
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
    };
    const hubspot = makeFakeHubspot({
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue(['c-juridico']),
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        // Proveedor lookup first, then juridico lookup
        .mockResolvedValueOnce(proveedorContact)
        .mockResolvedValueOnce(juridico),
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

  test('happy path con directionId específico: usa esa dirección, no la primera', async () => {
    const hubspot = makeFakeHubspot({
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([direccionA, direccionB]),
    });
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
      directionId: 'dir-B',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { direccion: { direction: string } | null };
    expect(ctxArg.direccion).toEqual({ direction: 'Calle B' });
  });

  test('sin direcciones en la company: direccion null en el contexto, sin error', async () => {
    const hubspot = makeFakeHubspot({
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([]),
    });
    const templateMapping = makeFakeMapping();
    const service = createEnvelopesService({
      hubspot,
      docusign: makeFakeDocusign(),
      templateMapping,
      templateRoles: makeFakeTemplateRoles(),
      portalId: 'portal-1',
    });

    await service.sendFromTemplate({
      dealId: '12345',
      templateId: 'tpl-abc',
      contactId: 'c-ada',
    });

    const ctxArg = (templateMapping.resolveTabValues as jest.Mock).mock
      .calls[0]![0] as { direccion: unknown };
    expect(ctxArg.direccion).toBeNull();
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
      getProveedorContactId: jest
        .fn<TemplateRolesResolver['getProveedorContactId']>()
        .mockReturnValue(undefined),
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
          id: 'c-prov', firstName: 'María', lastName: 'G', email: '', docIdentificacion: '',
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
    };
    const hubspot = makeFakeHubspot({
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue(['c-juridico']),
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        .mockResolvedValueOnce(proveedorContact)
        .mockResolvedValueOnce(juridicoSinEmail),
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

  test('DUPLICATE_RECIPIENT_EMAIL cuando Propietario y Cliente comparten email', async () => {
    const hubspot = makeFakeHubspot({
      getDealOwner: jest
        .fn<HubSpotAdapter['getDealOwner']>()
        .mockResolvedValue({ id: 'o-1', name: 'C', email: 'ADA@math.org' }),
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
