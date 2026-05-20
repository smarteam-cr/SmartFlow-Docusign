import { describe, expect, jest, test, afterEach } from '@jest/globals';
import { createHubSpotFilesAdapter } from '../hubspot-files.adapter.js';

const adapter = createHubSpotFilesAdapter({ accessToken: 'test-token' });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HubSpotFilesAdapter.uploadFile', () => {
  test('happy path: POST 200 returns fileId and url', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'file-123', url: 'https://files.hubspot.com/file-123' }),
      } as Response)
    );

    const result = await adapter.uploadFile({
      filename: 'test.pdf',
      buffer: Buffer.from('pdf-content'),
      access: 'PRIVATE',
    });

    expect(result).toEqual({ fileId: 'file-123', url: 'https://files.hubspot.com/file-123' });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/files/v3/files');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  test('non-ok response throws HUBSPOT_FILES_UPLOAD_FAILED', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      } as Response)
    );

    await expect(
      adapter.uploadFile({ filename: 'fail.pdf', buffer: Buffer.from('x'), access: 'PRIVATE' })
    ).rejects.toMatchObject({ code: 'HUBSPOT_FILES_UPLOAD_FAILED', httpStatus: 502 });
  });
});

describe('HubSpotFilesAdapter.findFileByName', () => {
  test('found: returns fileId', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ id: 'file-abc' }] }),
      } as Response)
    );

    const result = await adapter.findFileByName('deal-1-env-1.pdf');
    expect(result).toEqual({ fileId: 'file-abc' });
  });

  test('not found: returns null when results is empty', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      } as Response)
    );

    expect(await adapter.findFileByName('nonexistent.pdf')).toBeNull();
  });

  test('API error: returns null (tolerant)', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response)
    );

    expect(await adapter.findFileByName('error.pdf')).toBeNull();
  });
});
