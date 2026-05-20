import { ExternalServiceError } from '../../lib/errors/index.js';
import { createJwtAuthClient, type JwtAuthClient } from './docusign.auth.js';

const DOCUSIGN_TIMEOUT_MS = 15_000;

export interface TemplateSummary {
  id: string;
  name: string;
}

export interface TemplateRole {
  roleName: string;
  name: string;
  email: string;
  routingOrder: number;
  tabs?: Record<string, string>;
}

export interface SendEnvelopeInput {
  templateId: string;
  roles: TemplateRole[];
  customFields?: Record<string, string>;
}

export interface SendEnvelopeResult {
  envelopeId: string;
  status: string;
}

export interface DocusignAdapter {
  listTemplates(): Promise<TemplateSummary[]>;
  sendEnvelopeFromTemplate(input: SendEnvelopeInput): Promise<SendEnvelopeResult>;
  downloadCombinedDocument(envelopeId: string): Promise<Buffer>;
}

export interface DocusignAdapterConfig {
  clientId: string;
  userId: string;
  privateKey: string;
  accountId: string;
  basePath: string;
  /** Optional: inject a custom auth client (for tests or future composition). */
  authClient?: JwtAuthClient;
}

export function createDocusignAdapter(config: DocusignAdapterConfig): DocusignAdapter {
  const auth =
    config.authClient ??
    createJwtAuthClient({
      clientId: config.clientId,
      userId: config.userId,
      privateKey: config.privateKey,
    });

  const accountUrl = `${config.basePath}/restapi/v2.1/accounts/${encodeURIComponent(config.accountId)}`;

  async function docusignFetch(
    url: string,
    init: RequestInit & { jsonBody?: unknown }
  ): Promise<Response> {
    const accessToken = await auth.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };

    let body: string | undefined;
    if (init.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.jsonBody);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOCUSIGN_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method: init.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ExternalServiceError(
        'DOCUSIGN_UNAVAILABLE',
        'No se pudo contactar a DocuSign',
        { cause: err instanceof Error ? err.message : String(err) }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async listTemplates(): Promise<TemplateSummary[]> {
      const url = `${accountUrl}/templates`;
      const res = await docusignFetch(url, { method: 'GET' });

      if (!res.ok) {
        throw new ExternalServiceError(
          'DOCUSIGN_UNAVAILABLE',
          `DocuSign respondió ${res.status} al listar templates`,
          { status: res.status }
        );
      }

      const body = (await res.json()) as {
        envelopeTemplates?: Array<{ templateId?: string; name?: string }>;
      };

      return (body.envelopeTemplates ?? [])
        .filter((t) => t.templateId && t.name)
        .map((t) => ({ id: t.templateId!, name: t.name! }));
    },

    async sendEnvelopeFromTemplate(input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
      const url = `${accountUrl}/envelopes`;

      const requestBody = {
        templateId: input.templateId,
        templateRoles: input.roles.map((r) => ({
          roleName: r.roleName,
          name: r.name,
          email: r.email,
          routingOrder: r.routingOrder,
          ...(r.tabs
            ? {
                tabs: {
                  textTabs: Object.entries(r.tabs).map(([tabLabel, value]) => {
                    const base = { tabLabel, value };
                    return tabLabel.startsWith('#HREF_')
                      ? { ...base, name: value }
                      : base;
                  }),
                },
              }
            : {}),
        })),
        status: 'sent',
        ...(input.customFields && Object.keys(input.customFields).length > 0
          ? {
              customFields: {
                textCustomFields: Object.entries(input.customFields).map(([name, value]) => ({
                  name,
                  value,
                  show: 'false',
                  required: 'false',
                })),
              },
            }
          : {}),
      };

      const res = await docusignFetch(url, { method: 'POST', jsonBody: requestBody });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new ExternalServiceError(
          'DOCUSIGN_UNAVAILABLE',
          `DocuSign respondió ${res.status} al enviar el envelope`,
          { status: res.status, body: errBody.slice(0, 500) }
        );
      }

      const body = (await res.json()) as { envelopeId?: string; status?: string };
      if (!body.envelopeId) {
        throw new ExternalServiceError(
          'DOCUSIGN_UNAVAILABLE',
          'DocuSign no devolvió envelopeId en la respuesta',
          { response: JSON.stringify(body).slice(0, 200) }
        );
      }

      return {
        envelopeId: body.envelopeId,
        status: body.status ?? 'sent',
      };
    },

    async downloadCombinedDocument(envelopeId: string): Promise<Buffer> {
      const url = `${accountUrl}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`;
      const res = await docusignFetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new ExternalServiceError(
          'DOCUSIGN_UNAVAILABLE',
          `DocuSign respondió ${res.status} al descargar PDF del envelope ${envelopeId}`,
          { envelopeId, status: res.status }
        );
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
