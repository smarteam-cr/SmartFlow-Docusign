import { describe, expect, jest, test } from '@jest/globals';
import {
  createSendContextService,
  type SendContextServiceDeps,
} from '../send-context.service.js';
import type { Contact, Direccion, HubSpotAdapter } from '../../integrations/HS/index.js';
import type { DocusignAdapter, TemplateSummary } from '../../integrations/Docusign/index.js';
import { ValidationError } from '../../lib/errors/index.js';

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
});
