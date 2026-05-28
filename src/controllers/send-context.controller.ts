import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SendContextService } from '../services/send-context.service.js';

export const sendContextParamsSchema = z.object({
  dealId: z.string().min(1).regex(/^[0-9]+$/, 'dealId debe ser numérico'),
});

export type SendContextParams = z.infer<typeof sendContextParamsSchema>;

export interface SendContextController {
  getSendContext(
    req: FastifyRequest<{ Params: SendContextParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply>;
}

export function createSendContextController(
  service: SendContextService
): SendContextController {
  return {
    async getSendContext(req, reply) {
      const result = await service.getSendContext(req.params.dealId);
      return reply.status(200).send(result);
    },
  };
}
