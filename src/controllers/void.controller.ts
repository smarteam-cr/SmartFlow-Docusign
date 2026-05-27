import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EnvelopesService } from '../services/index.js';

export const voidEnvelopeBodySchema = z.object({
  dealId: z.string().min(1).regex(/^[0-9]+$/, 'dealId debe ser numérico'),
  reason: z.string().min(5, 'La razón debe tener al menos 5 caracteres'),
});

export const voidEnvelopeParamsSchema = z.object({
  envelopeId: z.string().min(1),
});

export type VoidEnvelopeBody = z.infer<typeof voidEnvelopeBodySchema>;
export type VoidEnvelopeParams = z.infer<typeof voidEnvelopeParamsSchema>;

export interface VoidController {
  void(
    req: FastifyRequest<{ Body: VoidEnvelopeBody; Params: VoidEnvelopeParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply>;
}

export function createVoidController(envelopesService: EnvelopesService): VoidController {
  return {
    async void(req, reply) {
      const { envelopeId } = req.params;
      await envelopesService.voidEnvelope({
        envelopeId,
        dealId: req.body.dealId,
        reason: req.body.reason,
      });
      return reply.status(200).send({ success: true });
    },
  };
}
