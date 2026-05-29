import { describe, expect, jest, test } from '@jest/globals';
import {
  createSendContextService,
  type SendContextServiceDeps,
} from '../send-context.service.js';
import type { Contact, Direccion, HubSpotAdapter } from '../../integrations/HS/index.js';
import type { DocusignAdapter, TemplateSummary } from '../../integrations/Docusign/index.js';
import { AppError, ValidationError } from '../../lib/errors/index.js';
import type { Capex, Quote } from '../../integrations/HS/index.js';

const CONTACT_A: Contact = {
  id: '101',
  firstName: 'Ana',
  lastName: 'López',
  email: 'ana@example.com',
  docIdentificacion: '12345',
};

const CONTACT_B: Contact = {
  id: '102',
  firstName: 'Bruno',
  lastName: 'García',
  email: 'bruno@example.com',
  docIdentificacion: '67890',
};

const TEMPLATE: TemplateSummary = { id: 'tpl-1', name: 'Contrato' };

const DIRECCION: Direccion = { id: 'dir-1', direction: 'Calle Mayor 10' };

const CAPEX_A: Capex = {
  id: 'capex-1',
  qrCapex: 'QR001',
  nombre: 'Capex Uno',
  cantidad: '2',
  costoNeto: '1000',
  hsCreatedate: '2026-01-01T00:00:00Z',
};

const CAPEX_B: Capex = {
  id: 'capex-2',
  qrCapex: 'QR002',
  nombre: 'Capex Dos',
  cantidad: '3',
  costoNeto: '2000',
  hsCreatedate: '2026-01-02T00:00:00Z',
};

const QUOTE: Quote = { id: 'q-1', hsQuoteLink: 'https://quote.link' };

function makeFakeDeps(
  overrides?: Partial<SendContextServiceDeps>
): SendContextServiceDeps {
  return {
    hubspot: {
      getDealContacts: jest
        .fn<HubSpotAdapter['getDealContacts']>()
        .mockResolvedValue([CONTACT_A, CONTACT_B]),
      findJuridicoContactIds: jest
        .fn<HubSpotAdapter['findJuridicoContactIds']>()
        .mockResolvedValue([]),
      getDealPrimaryCompany: jest
        .fn<HubSpotAdapter['getDealPrimaryCompany']>()
        .mockResolvedValue({ id: 'comp-1', razonSocial: 'Acme', pais: 'ES' }),
      getContactById: jest
        .fn<HubSpotAdapter['getContactById']>()
        .mockResolvedValue(CONTACT_A),
      getCompanyDirecciones: jest
        .fn<HubSpotAdapter['getCompanyDirecciones']>()
        .mockResolvedValue([DIRECCION]),
      getDealCapex: jest
        .fn<HubSpotAdapter['getDealCapex']>()
        .mockResolvedValue([CAPEX_A, CAPEX_B]),
      getDealLatestQuote: jest
        .fn<HubSpotAdapter['getDealLatestQuote']>()
        .mockResolvedValue(QUOTE),
    },
    docusign: {
      listTemplates: jest
        .fn<DocusignAdapter['listTemplates']>()
        .mockResolvedValue([TEMPLATE]),
    },
    ...overrides,
  };
}

describe('SendContextService.getSendContext', () => {
  test('dropdown mode: 0 juridicos returns contacts, direcciones, templates', async () => {
    const deps = makeFakeDeps();
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.clienteMode).toBe('dropdown');
    expect(result.juridicoContact).toBeNull();
    expect(result.contacts).toEqual([CONTACT_A, CONTACT_B]);
    expect(result.direcciones).toEqual([DIRECCION]);
    expect(result.templates).toEqual([TEMPLATE]);
    expect(deps.hubspot.getContactById).not.toHaveBeenCalled();
  });

  test('juridico mode: 1 juridico fetches contact and sets mode', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        findJuridicoContactIds: jest
          .fn<HubSpotAdapter['findJuridicoContactIds']>()
          .mockResolvedValue(['101']),
        getContactById: jest
          .fn<HubSpotAdapter['getContactById']>()
          .mockResolvedValue(CONTACT_A),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.clienteMode).toBe('juridico');
    expect(result.juridicoContact).toEqual(CONTACT_A);
    expect(deps.hubspot.getContactById).toHaveBeenCalledWith('101');
  });

  test('multiple_juridicos_error mode: >1 juridicos', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        findJuridicoContactIds: jest
          .fn<HubSpotAdapter['findJuridicoContactIds']>()
          .mockResolvedValue(['101', '102']),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.clienteMode).toBe('multiple_juridicos_error');
    expect(result.juridicoContact).toBeNull();
    expect(deps.hubspot.getContactById).not.toHaveBeenCalled();
  });

  test('no company: direcciones empty, no error thrown', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        getDealPrimaryCompany: jest
          .fn<HubSpotAdapter['getDealPrimaryCompany']>()
          .mockRejectedValue(
            new ValidationError('DEAL_HAS_NO_COMPANY', 'No company')
          ),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.direcciones).toEqual([]);
    expect(result.clienteMode).toBe('dropdown');
    expect(result.contacts).toEqual([CONTACT_A, CONTACT_B]);
    expect(deps.hubspot.getCompanyDirecciones).not.toHaveBeenCalled();
  });

  test('no contacts: returns empty contacts array, mode dropdown', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        getDealContacts: jest
          .fn<HubSpotAdapter['getDealContacts']>()
          .mockResolvedValue([]),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.contacts).toEqual([]);
    expect(result.clienteMode).toBe('dropdown');
  });

  test('company is returned with razonSocial and pais', async () => {
    const deps = makeFakeDeps();
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.company).toEqual({ razonSocial: 'Acme', pais: 'ES' });
  });

  test('company is null when DEAL_HAS_NO_COMPANY', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        getDealPrimaryCompany: jest
          .fn<HubSpotAdapter['getDealPrimaryCompany']>()
          .mockRejectedValue(
            new ValidationError('DEAL_HAS_NO_COMPANY', 'No company')
          ),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.company).toBeNull();
  });

  test('capexCount matches array length', async () => {
    const deps = makeFakeDeps();
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.capexCount).toBe(2);
  });

  test('hasQuote is true when quote exists', async () => {
    const deps = makeFakeDeps();
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.hasQuote).toBe(true);
  });

  test('hasQuote is false when QUOTE_NOT_FOUND', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        getDealLatestQuote: jest
          .fn<HubSpotAdapter['getDealLatestQuote']>()
          .mockRejectedValue(
            new ValidationError('QUOTE_NOT_FOUND', 'No quote')
          ),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.hasQuote).toBe(false);
  });

  test('capexCount is 0 when CAPEX_TOO_MANY', async () => {
    const deps = makeFakeDeps({
      hubspot: {
        ...makeFakeDeps().hubspot,
        getDealCapex: jest
          .fn<HubSpotAdapter['getDealCapex']>()
          .mockRejectedValue(
            new ValidationError('CAPEX_TOO_MANY', 'Demasiados capex', {
              dealId: 'd-1',
              count: 10,
              max: 6,
            })
          ),
      },
    });
    const service = createSendContextService(deps);

    const result = await service.getSendContext('d-1');

    expect(result.capexCount).toBe(0);
  });
});
