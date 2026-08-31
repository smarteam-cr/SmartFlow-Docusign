import { describe, expect, jest, test, afterEach } from '@jest/globals';
import { createHubSpotAdapter } from '../hubspot.adapter.js';

const adapter = createHubSpotAdapter({
  accessToken: 'test-token',
  parametrosDcObjectType: '2-68469940',
});

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
              country: 'Costa Rica',
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
      pais: 'Costa Rica',
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
        body: {
          id: 'co-1',
          properties: {
            raz_n_social__c: 'SIGMA ALIMENTOS',
            pais: 'MX',
            direccion_fiscal: 'Av. Reforma 100, CDMX',
          },
        },
      },
    ]);

    const company = await adapter.getDealPrimaryCompany('d-1');
    expect(company).toEqual({
      id: 'co-1',
      razonSocial: 'SIGMA ALIMENTOS',
      pais: 'MX',
      direccionFiscal: 'Av. Reforma 100, CDMX',
    });
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
    expect(company).toEqual({ id: 'co-2', razonSocial: '', pais: '', direccionFiscal: '' });
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
            country: 'España',
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
      pais: 'España',
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

  test('detecta label con formato display "Responsable Jurídico" (v4 real)', async () => {
    mockFetchSequence([{
      status: 200,
      body: {
        results: [{
          toObjectId: 221686555018,
          associationTypes: [
            { category: 'USER_DEFINED', typeId: 138, label: 'Responsable Jurídico' },
            { category: 'HUBSPOT_DEFINED', typeId: 3, label: null },
          ],
        }],
      },
    }]);
    const ids = await adapter.findJuridicoContactIds('d-1');
    expect(ids).toEqual(['221686555018']);
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
    expect(capex[0]?.codigo_qr).toBe('');
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

describe('HubSpotAdapter.createNoteForDeal', () => {
  test('happy path: POST 201 returns noteId', async () => {
    mockFetchSequence([{ status: 201, body: { id: 'note-1' } }]);
    const result = await adapter.createNoteForDeal({
      dealId: 'd-1',
      body: '<p>Test note</p>',
    });
    expect(result).toEqual({ noteId: 'note-1' });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/crm/v3/objects/notes');
    expect(init.method).toBe('POST');
  });

  test('includes hs_attachment_ids when attachmentIds provided', async () => {
    mockFetchSequence([{ status: 201, body: { id: 'note-2' } }]);
    await adapter.createNoteForDeal({
      dealId: 'd-1',
      body: '<p>With attachment</p>',
      attachmentIds: ['file-a', 'file-b'],
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as { properties: Record<string, string> };
    expect(parsed.properties.hs_attachment_ids).toBe('file-a;file-b');
  });

  test('includes contact associations when contactIds provided', async () => {
    mockFetchSequence([{ status: 201, body: { id: 'note-3' } }]);
    await adapter.createNoteForDeal({
      dealId: 'd-1',
      body: '<p>With contacts</p>',
      contactIds: ['c-1', 'c-2'],
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      associations: Array<{ to: { id: string }; types: Array<{ associationTypeId: number }> }>;
    };
    expect(parsed.associations).toHaveLength(3);
    expect(parsed.associations[0]!.to.id).toBe('d-1');
    expect(parsed.associations[0]!.types[0]!.associationTypeId).toBe(214);
    expect(parsed.associations[1]!.to.id).toBe('c-1');
    expect(parsed.associations[1]!.types[0]!.associationTypeId).toBe(202);
    expect(parsed.associations[2]!.to.id).toBe('c-2');
    expect(parsed.associations[2]!.types[0]!.associationTypeId).toBe(202);
  });

  test('only deal association when no contactIds', async () => {
    mockFetchSequence([{ status: 201, body: { id: 'note-4' } }]);
    await adapter.createNoteForDeal({ dealId: 'd-1', body: '<p>Solo deal</p>' });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      associations: Array<{ to: { id: string } }>;
    };
    expect(parsed.associations).toHaveLength(1);
    expect(parsed.associations[0]!.to.id).toBe('d-1');
  });

  test('500 throws HUBSPOT_UNAVAILABLE', async () => {
    mockFetchSequence([{ status: 500, body: {} }]);
    await expect(
      adapter.createNoteForDeal({ dealId: 'd-1', body: '<p>fail</p>' })
    ).rejects.toMatchObject({ code: 'HUBSPOT_UNAVAILABLE', httpStatus: 502 });
  });
});

describe('HubSpotAdapter.getDealProperties', () => {
  test('returns requested properties as Record<string, string>', async () => {
    mockFetchSequence([{
      status: 200,
      body: {
        id: 'd-1',
        properties: {
          docusign_latest_status: 'sent',
          docusign_latest_envelope_id: 'env-abc',
        },
      },
    }]);

    const result = await adapter.getDealProperties('d-1', [
      'docusign_latest_status',
      'docusign_latest_envelope_id',
    ]);
    expect(result).toEqual({
      docusign_latest_status: 'sent',
      docusign_latest_envelope_id: 'env-abc',
    });

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('properties=docusign_latest_status');
    expect(url).toContain('docusign_latest_envelope_id');
  });

  test('returns empty strings for null/undefined properties', async () => {
    mockFetchSequence([{
      status: 200,
      body: { id: 'd-1', properties: { docusign_latest_status: null } },
    }]);

    const result = await adapter.getDealProperties('d-1', ['docusign_latest_status']);
    expect(result.docusign_latest_status).toBe('');
  });

  test('throws DEAL_NOT_FOUND on 404', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);
    await expect(adapter.getDealProperties('d-ghost', ['x'])).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });

  test('throws HUBSPOT_UNAVAILABLE on 500', async () => {
    mockFetchSequence([{ status: 500, body: {} }]);
    await expect(adapter.getDealProperties('d-1', ['x'])).rejects.toMatchObject({
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

describe('HubSpotAdapter.getDealSupervisor', () => {
  test('happy path: lee la propiedad supervisor del Deal y resuelve el owner', async () => {
    const calls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      const body =
        calls.length === 1
          ? { id: 'd-1', properties: { supervisor: '18811253' } }
          : { id: 18811253, firstName: 'Jessica', lastName: 'Gonzalez', email: 'jessica@inve.com' };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(''),
      } as Response);
    });

    const supervisor = await adapter.getDealSupervisor('d-1');
    expect(supervisor).toEqual({
      id: '18811253',
      name: 'Jessica Gonzalez',
      email: 'jessica@inve.com',
    });
    expect(calls[0]).toContain('properties=supervisor');
    expect(calls[1]).toContain('/crm/v3/owners/18811253');
  });

  test('lanza DEAL_SUPERVISOR_MISSING cuando el Deal no tiene supervisor', async () => {
    mockFetchSequence([{ status: 200, body: { id: 'd-1', properties: { supervisor: null } } }]);

    await expect(adapter.getDealSupervisor('d-1')).rejects.toMatchObject({
      code: 'DEAL_SUPERVISOR_MISSING',
      httpStatus: 422,
    });
  });

  test('lanza SUPERVISOR_NOT_FOUND cuando el owner fue eliminado (404)', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { supervisor: '18811253' } } },
      { status: 404, body: {} },
    ]);

    await expect(adapter.getDealSupervisor('d-1')).rejects.toMatchObject({
      code: 'SUPERVISOR_NOT_FOUND',
      httpStatus: 422,
    });
  });

  test('lanza SUPERVISOR_EMAIL_MISSING cuando el owner no tiene email', async () => {
    mockFetchSequence([
      { status: 200, body: { id: 'd-1', properties: { supervisor: '18811253' } } },
      { status: 200, body: { firstName: 'Jessica', lastName: 'Gonzalez', email: '' } },
    ]);

    await expect(adapter.getDealSupervisor('d-1')).rejects.toMatchObject({
      code: 'SUPERVISOR_EMAIL_MISSING',
      httpStatus: 422,
    });
  });

  test('lanza DEAL_NOT_FOUND cuando el Deal no existe', async () => {
    mockFetchSequence([{ status: 404, body: {} }]);

    await expect(adapter.getDealSupervisor('d-nope')).rejects.toMatchObject({
      code: 'DEAL_NOT_FOUND',
      httpStatus: 404,
    });
  });
});

describe('HubSpotAdapter.getParametrosDcByTemplate', () => {
  const row = {
    id: '61130879017',
    properties: {
      pais: 'Costa Rica',
      template: 'tpl-cr',
      legal_representative_code: '228008555346',
      cm_id_hubspot_code: '227829453070',
      usuario_legal: '203298100366',
    },
  };

  test('busca por la propiedad template y mapea la fila', async () => {
    let captured: { url: string; body: unknown } | null = null;
    jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
      captured = { url: String(url), body: JSON.parse(String((init as RequestInit).body)) };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ total: 1, results: [row] }),
        text: () => Promise.resolve(''),
      } as Response);
    });

    const result = await adapter.getParametrosDcByTemplate('tpl-cr');

    expect(result).toEqual({
      recordId: '61130879017',
      pais: 'Costa Rica',
      templateId: 'tpl-cr',
      legalRepresentativeCode: '228008555346',
      cmIdHubspotCode: '227829453070',
      usuarioLegal: '203298100366',
    });
    const sent = captured as unknown as { url: string; body: Record<string, unknown> };
    expect(sent.url).toContain('/crm/v3/objects/2-68469940/search');
    expect(sent.body.filterGroups).toEqual([
      { filters: [{ propertyName: 'template', operator: 'EQ', value: 'tpl-cr' }] },
    ]);
  });

  test('retorna null cuando no hay fila para ese template', async () => {
    mockFetchSequence([{ status: 200, body: { total: 0, results: [] } }]);
    await expect(adapter.getParametrosDcByTemplate('tpl-sin-fila')).resolves.toBeNull();
  });

  test('lanza PARAMETROS_DC_DUPLICATE cuando hay más de una fila', async () => {
    mockFetchSequence([
      { status: 200, body: { total: 2, results: [row, { ...row, id: '999' }] } },
    ]);

    await expect(adapter.getParametrosDcByTemplate('tpl-cr')).rejects.toMatchObject({
      code: 'PARAMETROS_DC_DUPLICATE',
      httpStatus: 422,
    });
  });

  test('tolera propiedades vacías o ausentes', async () => {
    mockFetchSequence([
      { status: 200, body: { total: 1, results: [{ id: 'r-1', properties: { pais: '  Honduras  ' } }] } },
    ]);

    await expect(adapter.getParametrosDcByTemplate('tpl-hn')).resolves.toEqual({
      recordId: 'r-1',
      pais: 'Honduras',
      templateId: 'tpl-hn',
      legalRepresentativeCode: '',
      cmIdHubspotCode: '',
      usuarioLegal: '',
    });
  });

  test('lanza HUBSPOT_UNAVAILABLE en 500', async () => {
    mockFetchSequence([{ status: 500, body: {} }]);
    await expect(adapter.getParametrosDcByTemplate('tpl-cr')).rejects.toMatchObject({
      code: 'HUBSPOT_UNAVAILABLE',
      httpStatus: 502,
    });
  });
});
