import { ExternalServiceError } from '../../lib/errors/index.js';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const UPLOAD_TIMEOUT_MS = 30_000;
const SEARCH_TIMEOUT_MS = 10_000;

export interface HubSpotFilesAdapter {
  uploadFile(params: {
    filename: string;
    buffer: Buffer;
    folderId?: string;
    access: 'PRIVATE' | 'PUBLIC_INDEXABLE' | 'PUBLIC_NOT_INDEXABLE';
  }): Promise<{ fileId: string; url: string }>;

  findFileByName(filename: string): Promise<{ fileId: string } | null>;
}

export interface HubSpotFilesAdapterConfig {
  accessToken: string;
}

export function createHubSpotFilesAdapter(config: HubSpotFilesAdapterConfig): HubSpotFilesAdapter {
  return {
    async uploadFile(params) {
      const url = `${HUBSPOT_BASE_URL}/files/v3/files`;
      const formData = new FormData();
      formData.append('file', new Blob([params.buffer]), params.filename);
      formData.append('folderPath', '/contratos-firmados');
      formData.append(
        'options',
        JSON.stringify({
          access: params.access,
          name: params.filename,
        })
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.accessToken}` },
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new ExternalServiceError(
            'HUBSPOT_FILES_UPLOAD_FAILED',
            `HubSpot Files respondió ${res.status} al subir ${params.filename}`,
            { status: res.status, body: errBody.slice(0, 500) }
          );
        }
        const body = (await res.json()) as { id?: string; url?: string };
        return { fileId: body.id ?? '', url: body.url ?? '' };
      } catch (err) {
        if (err instanceof ExternalServiceError) throw err;
        throw new ExternalServiceError(
          'HUBSPOT_FILES_UPLOAD_FAILED',
          `Error de red al subir ${params.filename} a HubSpot Files`,
          { cause: err instanceof Error ? err.message : String(err) }
        );
      } finally {
        clearTimeout(timeout);
      }
    },

    async findFileByName(filename) {
      const url = `${HUBSPOT_BASE_URL}/files/v3/files/search?name=${encodeURIComponent(filename)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { results?: Array<{ id?: string }> };
        const first = body.results?.[0];
        return first?.id ? { fileId: first.id } : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
