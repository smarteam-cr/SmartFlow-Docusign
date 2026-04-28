import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EnvelopesService } from '../services/index.js';

/**
 * Schema for POST /api/v1/docusign/envelopes body.
 * Exported so routes can register it with Fastify for validation.
 */
export const sendEnvelopeBodySchema = z.object({
  dealId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9]+$/, 'dealId debe ser numérico'),
  templateId: z.string().min(1).max(64),
});

export type SendEnvelopeBody = z.infer<typeof sendEnvelopeBodySchema>;

export interface EnvelopesController {
  send(
    req: FastifyRequest<{ Body: SendEnvelopeBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply>;
}

/**
 * POST /api/v1/docusign/envelopes handler.
 * Body has been validated by the time we get here (zod via type-provider),
 * so we trust req.body shape and just delegate to the service.
 */
export function createEnvelopesController(service: EnvelopesService): EnvelopesController {
  return {
    async send(req, reply) {
      const result = await service.sendFromTemplate(req.body);
      return reply.status(201).send(result);
    },
  };
}
