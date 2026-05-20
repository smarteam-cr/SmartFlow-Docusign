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

describe('HubSpotAdapter.getDealContacts', () => {
  test('retorna contactos con docIdentificacion del batch read', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'c-1' }] } },
      {
        status: 200,
        body: {
          results: [{
            id: 'c-1',
            properties: {
              firstname: 'Ada',
              lastname: 'Lovelace',
              email: 'ada@math.org',
              doc_identificacion: 'CC-99999',
            },
          }],
        },
      },
    ]);

    const contacts = await adapter.getDealContacts('d-1');
    expect(contacts).toEqual([{
      id: 'c-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@math.org',
      docIdentificacion: 'CC-99999',
    }]);
  });

  test('tolera doc_identificacion ausente en algunos contactos', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'c-1' }] } },
      {
        status: 200,
        body: {
          results: [{
            id: 'c-1',
            properties: { firstname: 'X', lastname: 'Y', email: 'x@y.co' },
          }],
        },
      },
    ]);

    const contacts = await adapter.getDealContacts('d-1');
    expect(contacts[0]?.docIdentificacion).toBe('');
  });
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
  test('happy path: retorna contacto con nombre, email y docIdentificacion', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          id: 'c-proveedor',
          properties: {
            firstname: 'María',
            lastname: 'Gómez',
            email: 'maria@proveedor.co',
            doc_identificacion: 'V-12345',
          },
        },
      },
    ]);

    const contact = await adapter.getContactById('c-proveedor');
    expect(contact).toEqual({
      id: 'c-proveedor',
      firstName: 'María',
      lastName: 'Gómez',
      email: 'maria@proveedor.co',
      docIdentificacion: 'V-12345',
    });
  });

  test('doc_identificacion ausente devuelve string vacío', async () => {
    mockFetchSequence([
      {
        status: 200,
        body: {
          id: 'c-1',
          properties: { firstname: 'Ana', lastname: 'P', email: 'ana@x.co' },
        },
      },
    ]);

    const contact = await adapter.getContactById('c-1');
    expect(contact.docIdentificacion).toBe('');
  });

  test('lanza PROVEEDOR_CONTACT_NOT_FOUND cuando el contacto no existe (404)', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);

    await expect(adapter.getContactById('c-ghost')).rejects.toMatchObject({
      code: 'PROVEEDOR_CONTACT_NOT_FOUND',
      httpStatus: 422,
    });
  });
});

describe('HubSpotAdapter.findJuridicoContactIds', () => {
  test('retorna IDs de contactos con label responsable_jurídico', async () => {
    mockFetchSequence([{
      status: 200,
      body: {
        results: [
          {
            toObjectId: 'c-1',
            associationTypes: [{ category: 'HUBSPOT_DEFINED', label: 'Contact' }],
          },
          {
            toObjectId: 'c-2',
            associationTypes: [
              { category: 'HUBSPOT_DEFINED', label: 'Contact' },
              { category: 'USER_DEFINED', label: 'responsable_jurídico' },
            ],
          },
        ],
      },
    }]);

    const ids = await adapter.findJuridicoContactIds('d-1');
    expect(ids).toEqual(['c-2']);
  });

  test('retorna array vacío si ningún contacto tiene el label', async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    const ids = await adapter.findJuridicoContactIds('d-1');
    expect(ids).toEqual([]);
  });

  test('deduplica IDs cuando un contacto tiene múltiples association types con el mismo label', async () => {
    mockFetchSequence([{
      status: 200,
      body: {
        results: [{
          toObjectId: 'c-1',
          associationTypes: [
            { category: 'USER_DEFINED', label: 'responsable_jurídico' },
            { category: 'USER_DEFINED', label: 'responsable_jurídico' },
          ],
        }],
      },
    }]);
    const ids = await adapter.findJuridicoContactIds('d-1');
    expect(ids).toEqual(['c-1']);
  });

  test('lanza DEAL_NOT_FOUND con 404', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(adapter.findJuridicoContactIds('d-ghost')).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('HubSpotAdapter.getDealCapex', () => {
  test('retorna array vacío si el deal no tiene capex', async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    const capex = await adapter.getDealCapex('d-1');
    expect(capex).toEqual([]);
  });

  test('retorna capex ordenados por hs_createdate ascendente', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'cx-2' }, { toObjectId: 'cx-1' }] } },
      {
        status: 200,
        body: {
          results: [
            { id: 'cx-2', properties: { qr_capex: 'Q2', nombre: 'B', cantidad: '2', costo_neto: '200', hs_createdate: '2026-02-02' } },
            { id: 'cx-1', properties: { qr_capex: 'Q1', nombre: 'A', cantidad: '1', costo_neto: '100', hs_createdate: '2026-01-01' } },
          ],
        },
      },
    ]);
    const capex = await adapter.getDealCapex('d-1');
    expect(capex.map((c) => c.id)).toEqual(['cx-1', 'cx-2']);
  });

  test('lanza CAPEX_TOO_MANY cuando hay más de 6', async () => {
    mockFetchSequence([{
      status: 200,
      body: { results: Array.from({ length: 7 }, (_, i) => ({ toObjectId: `cx-${i}` })) },
    }]);
    await expect(adapter.getDealCapex('d-1')).rejects.toMatchObject({
      code: 'CAPEX_TOO_MANY',
      httpStatus: 422,
    });
  });

  test('tolera propiedades vacías (qr_capex sin valor)', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'cx-1' }] } },
      {
        status: 200,
        body: {
          results: [{
            id: 'cx-1',
            properties: { nombre: 'A', cantidad: '1', costo_neto: '100', hs_createdate: '2026-01-01' },
          }],
        },
      },
    ]);
    const capex = await adapter.getDealCapex('d-1');
    expect(capex[0]?.qrCapex).toBe('');
    expect(capex[0]?.nombre).toBe('A');
  });

  test('lanza DEAL_NOT_FOUND con 404', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(adapter.getDealCapex('d-ghost')).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('HubSpotAdapter.getCompanyDirecciones', () => {
  test('retorna direcciones ordenadas por hs_createdate asc', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'dir-2' }, { toObjectId: 'dir-1' }] } },
      {
        status: 200,
        body: {
          results: [
            { id: 'dir-2', properties: { direction: 'Calle B', hs_createdate: '2026-02-02' } },
            { id: 'dir-1', properties: { direction: 'Calle A', hs_createdate: '2026-01-01' } },
          ],
        },
      },
    ]);
    const dirs = await adapter.getCompanyDirecciones('co-1');
    expect(dirs.map((d) => d.direction)).toEqual(['Calle A', 'Calle B']);
    expect(dirs.map((d) => d.id)).toEqual(['dir-1', 'dir-2']);
  });

  test('retorna array vacío si la company no tiene direcciones', async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    expect(await adapter.getCompanyDirecciones('co-1')).toEqual([]);
  });

  test('tolera direction vacío', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'dir-1' }] } },
      {
        status: 200,
        body: {
          results: [{ id: 'dir-1', properties: { hs_createdate: '2026-01-01' } }],
        },
      },
    ]);
    const dirs = await adapter.getCompanyDirecciones('co-1');
    expect(dirs[0]?.direction).toBe('');
  });
});

describe('HubSpotAdapter.getDealLatestQuote', () => {
  test('retorna la quote más reciente por hs_createdate desc', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'q-1' }, { toObjectId: 'q-2' }] } },
      {
        status: 200,
        body: {
          results: [
            { id: 'q-1', properties: { hs_quote_link: 'https://hubspot.com/q1', hs_createdate: '2026-01-01' } },
            { id: 'q-2', properties: { hs_quote_link: 'https://hubspot.com/q2', hs_createdate: '2026-02-02' } },
          ],
        },
      },
    ]);
    const q = await adapter.getDealLatestQuote('d-1');
    expect(q.id).toBe('q-2');
    expect(q.hsQuoteLink).toBe('https://hubspot.com/q2');
  });

  test('lanza QUOTE_NOT_FOUND cuando el deal no tiene quotes', async () => {
    mockFetchSequence([{ status: 200, body: { results: [] } }]);
    await expect(adapter.getDealLatestQuote('d-1')).rejects.toMatchObject({
      code: 'QUOTE_NOT_FOUND',
      httpStatus: 422,
    });
  });

  test('tolera hs_quote_link vacío (no lanza)', async () => {
    mockFetchSequence([
      { status: 200, body: { results: [{ toObjectId: 'q-1' }] } },
      {
        status: 200,
        body: {
          results: [{ id: 'q-1', properties: { hs_createdate: '2026-01-01' } }],
        },
      },
    ]);
    const q = await adapter.getDealLatestQuote('d-1');
    expect(q.hsQuoteLink).toBe('');
  });

  test('lanza DEAL_NOT_FOUND con 404', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(adapter.getDealLatestQuote('d-ghost')).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('HubSpotAdapter.updateDealProperties', () => {
  test('happy path: PATCH 200 resolves without error', async () => {
    mockFetchSequence([{ status: 200, body: { id: 'd-1' } }]);
    await expect(adapter.updateDealProperties('d-1', { docusign_latest_status: 'sent' })).resolves.toBeUndefined();

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/deals/d-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ properties: { docusign_latest_status: 'sent' } });
  });

  test('404 throws DEAL_NOT_FOUND', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(adapter.updateDealProperties('d-ghost', {})).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });

  test('500 throws HUBSPOT_UNAVAILABLE', async () => {
    mockFetchSequence([{ status: 500, body: {} }]);
    await expect(adapter.updateDealProperties('d-1', {})).rejects.toMatchObject({
      code: 'HUBSPOT_UNAVAILABLE',
      httpStatus: 502,
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
