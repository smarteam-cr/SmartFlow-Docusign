import { describe, expect, jest, test, afterEach } from '@jest/globals';
import { createDocusignAdapter } from '../docusign.adapter.js';
import type { JwtAuthClient } from '../docusign.auth.js';

const fakeAuth: JwtAuthClient = {
  getAccessToken: jest.fn<() => Promise<string>>().mockResolvedValue('fake-token'),
};

const adapter = createDocusignAdapter({
  clientId: 'cli-1',
  userId: 'usr-1',
  privateKey: 'pk',
  accountId: 'acc-1',
  basePath: 'https://demo.docusign.net',
  authClient: fakeAuth,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DocusignAdapter.downloadCombinedDocument', () => {
  test('returns a Buffer from the combined document endpoint', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
      } as Response)
    );

    const result = await adapter.downloadCombinedDocument('env-abc');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(4);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toContain('/envelopes/env-abc/documents/combined');
  });

  test('throws DOCUSIGN_UNAVAILABLE on non-ok response', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('error'),
      } as Response)
    );

    await expect(adapter.downloadCombinedDocument('env-bad')).rejects.toMatchObject({
      code: 'DOCUSIGN_UNAVAILABLE',
      httpStatus: 502,
    });
  });
});

describe('DocusignAdapter.sendEnvelopeFromTemplate', () => {
  test('textTab con prefijo #HREF_ recibe name = value para ser clickable', async () => {
    const captured: Array<Record<string, unknown>> = [];
    jest.spyOn(global, 'fetch').mockImplementation((_, init) => {
      captured.push(JSON.parse((init as RequestInit).body as string));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ envelopeId: 'env-1', status: 'sent' }),
      } as Response);
    });

    await adapter.sendEnvelopeFromTemplate({
      templateId: 'tpl-1',
      roles: [{
        roleName: 'Propietario',
        name: 'X',
        email: 'x@y.co',
        routingOrder: 1,
        tabs: { CampoNormal: 'algo', '#HREF_UrlCotizacion': 'https://hubspot.com/q1' },
      }],
    });

    const body = captured[0] as { templateRoles: Array<{ tabs: { textTabs: unknown[] } }> };
    const textTabs = body.templateRoles[0]!.tabs.textTabs;
    expect(textTabs).toEqual(expect.arrayContaining([
      { tabLabel: 'CampoNormal', value: 'algo' },
      { tabLabel: '#HREF_UrlCotizacion', value: 'https://hubspot.com/q1', name: 'https://hubspot.com/q1' },
    ]));
  });

  test('envía templateRoles con 3 entradas en el body; Propietario lleva textTabs', async () => {
    const capturedBody: unknown[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((_, init) => {
      capturedBody.push(JSON.parse((init as RequestInit).body as string));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ envelopeId: 'env-xyz', status: 'sent' }),
      } as Response);
    });

    await adapter.sendEnvelopeFromTemplate({
      templateId: 'tpl-1',
      roles: [
        { roleName: 'Propietario', name: 'Carlos Owner', email: 'carlos@co.com',
          routingOrder: 1, tabs: { Campo1: 'Valor1' } },
        { roleName: 'Proveedor', name: 'María Gómez', email: 'maria@prov.co',
          routingOrder: 2 },
        { roleName: 'Cliente', name: 'Ada Lovelace', email: 'ada@math.org',
          routingOrder: 3 },
      ],
    });

    expect(capturedBody[0]).toMatchObject({
      templateId: 'tpl-1',
      status: 'sent',
      templateRoles: [
        { roleName: 'Propietario', name: 'Carlos Owner', email: 'carlos@co.com',
          routingOrder: 1,
          tabs: { textTabs: [{ tabLabel: 'Campo1', value: 'Valor1' }] } },
        { roleName: 'Proveedor', name: 'María Gómez', email: 'maria@prov.co',
          routingOrder: 2 },
        { roleName: 'Cliente', name: 'Ada Lovelace', email: 'ada@math.org',
          routingOrder: 3 },
      ],
    });
  });
});
