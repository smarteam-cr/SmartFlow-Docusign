import { describe, expect, jest, test, afterEach } from '@jest/globals';
import { createHubSpotAdapter } from '../hubspot.adapter.js';

const adapter = createHubSpotAdapter({ accessToken: 'test-token' });

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  jest.spyOn(global, 'fetch').mockImplementation(() => {
    const r = responses[call++] ?? { status: 500, body: {} };
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    } as Response);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HubSpotAdapter.getDealPrimaryCompany', () => {
  test('retorna razonSocial y pais desde raz_n_social__c y pais', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          results: [{
            toObjectId: 'co-1',
            associationTypes: [{ category: 'HUBSPOT_DEFINED', label: 'Primary' }],
          }],
        },
      },
      {
        status: 200,
        body: { id: 'co-1', properties: { raz_n_social__c: 'SIGMA ALIMENTOS', pais: 'MX' } },
      },
    ]);

    const company = await adapter.getDealPrimaryCompany('d-1');
    expect(company).toEqual({ id: 'co-1', razonSocial: 'SIGMA ALIMENTOS', pais: 'MX' });
  });

  test('tolera raz_n_social__c y pais vacíos (devuelve strings vacíos)', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          results: [{
            toObjectId: 'co-2',
            associationTypes: [{ category: 'HUBSPOT_DEFINED', label: 'Primary' }],
          }],
        },
      },
      { status: 200, body: { id: 'co-2', properties: {} } },
    ]);

    const company = await adapter.getDealPrimaryCompany('d-1');
    expect(company).toEqual({ id: 'co-2', razonSocial: '', pais: '' });
  });

  test('lanza DEAL_HAS_NO_COMPANY cuando no hay association Primary', async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    await expect(adapter.getDealPrimaryCompany('d-1')).rejects.toMatchObject({
      code: 'DEAL_HAS_NO_COMPANY',
      httpStatus: 422,
    });
  });
});

describe('HubSpotAdapter.getContactById', () => {
  test('happy path: retorna contacto con nombre y email', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          id: 'c-proveedor',
          properties: { firstname: 'María', lastname: 'Gómez', email: 'maria@proveedor.co' },
        },
      },
    ]);

    const contact = await adapter.getContactById('c-proveedor');
    expect(contact).toEqual({
      id: 'c-proveedor',
      firstName: 'María',
      lastName: 'Gómez',
      email: 'maria@proveedor.co',
    });
  });

  test('lanza PROVEEDOR_CONTACT_NOT_FOUND cuando el contacto no existe (404)', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);

    await expect(adapter.getContactById('c-ghost')).rejects.toMatchObject({
      code: 'PROVEEDOR_CONTACT_NOT_FOUND',
      httpStatus: 422,
    });
  });
});

describe('HubSpotAdapter.getDealOwner', () => {
  test('happy path: retorna owner con nombre y email', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { hubspot_owner_id: '55555' } } },
      { status: 200, body: { id: 55555, firstName: 'Juan', lastName: 'Pérez', email: 'juan@acme.co' } },
    ]);

    const owner = await adapter.getDealOwner('d-1');
    expect(owner).toEqual({ id: '55555', name: 'Juan Pérez', email: 'juan@acme.co' });
  });

  test('lanza DEAL_OWNER_MISSING cuando el deal no tiene hubspot_owner_id', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { hubspot_owner_id: null } } },
    ]);

    await expect(adapter.getDealOwner('d-1')).rejects.toMatchObject({
      code: 'DEAL_OWNER_MISSING',
      httpStatus: 422,
    });
  });

  test('lanza OWNER_EMAIL_MISSING cuando el owner existe pero no tiene email', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { hubspot_owner_id: '55555' } } },
      { status: 200, body: { id: 55555, firstName: 'Juan', lastName: 'Pérez', email: '' } },
    ]);

    await expect(adapter.getDealOwner('d-1')).rejects.toMatchObject({
      code: 'OWNER_EMAIL_MISSING',
      httpStatus: 422,
    });
  });

  test('lanza OWNER_NOT_FOUND cuando el owner_id existe en el deal pero fue eliminado (owner 404)', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { hubspot_owner_id: '55555' } } },
      { status: 404, body: {} },
    ]);

    await expect(adapter.getDealOwner('d-1')).rejects.toMatchObject({
      code: 'OWNER_NOT_FOUND',
      httpStatus: 422,
    });
  });
});
