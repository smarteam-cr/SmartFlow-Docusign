import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyHmac } from '../lib/hmac/verifyHmac.js';
import type {
  EnvelopeLifecycleService,
  EnvelopeEvent,
} from '../services/envelope-lifecycle.service.js';

interface DocuSignConnectPayload {
  event?: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      customFields?: {
        textCustomFields?: Array<{ name?: string; value?: string }>;
      };
      recipients?: {
        signers?: Array<{
          email?: string;
          status?: string;
          recipientId?: string;
          declinedReason?: string;
        }>;
      };
      voidedReason?: string;
    };
  };
}

function parseConnectPayload(payload: DocuSignConnectPayload): EnvelopeEvent | null {
  const envelopeId = payload.data?.envelopeId;
  if (!envelopeId) return null;

  const summary = payload.data?.envelopeSummary;
  const status = summary?.status ?? '';
  if (!status) return null;

  const customFields = summary?.customFields?.textCustomFields ?? [];
  const dealId = customFields.find((f) => f.name === 'hubspot_deal_id')?.value ?? '';
  const portalId = customFields.find((f) => f.name === 'hubspot_portal_id')?.value ?? '';

  const signers = summary?.recipients?.signers ?? [];
  const recipientEvents = signers.map((s) => ({
    email: s.email ?? '',
    status: s.status ?? '',
    recipientId: s.recipientId ?? '',
  }));

  const declinedReason = signers.find((s) => s.declinedReason)?.declinedReason;

  return {
    envelopeId,
    status,
    dealId,
    portalId,
    recipientEvents: recipientEvents.length > 0 ? recipientEvents : undefined,
    declinedReason,
    voidedReason: summary?.voidedReason,
  };
}

export interface WebhooksController {
  handleDocusign(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

export function createWebhooksController(deps: {
  lifecycleService: EnvelopeLifecycleService;
  hmacSecret: string;
}): WebhooksController {
  return {
    async handleDocusign(request: FastifyRequest, reply: FastifyReply) {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody;
      if (rawBody === undefined) {
        request.log.error('rawBody not available — content type parser may be misconfigured');
        return reply.code(500).send({ error: 'WEBHOOK_RAW_BODY_MISSING' });
      }
      const signature = request.headers['x-docusign-signature-1'] as string | undefined;

      if (!signature || !verifyHmac(rawBody, signature, deps.hmacSecret)) {
        return reply.code(401).send({ error: 'WEBHOOK_HMAC_INVALID' });
      }

      const payload = request.body as DocuSignConnectPayload;
      const event = parseConnectPayload(payload);
      if (!event) {
        return reply.code(422).send({ error: 'WEBHOOK_PAYLOAD_INVALID' });
      }

      await deps.lifecycleService.handleEvent(event);

      return reply.code(200).send({ received: true });
    },
  };
}
