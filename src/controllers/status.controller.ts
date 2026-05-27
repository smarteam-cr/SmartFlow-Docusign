import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EnvelopeStatusService } from '../services/envelope-status.service.js';

export const statusParamsSchema = z.object({
  dealId: z.string().min(1).regex(/^[0-9]+$/, 'dealId debe ser numérico'),
});

export type StatusParams = z.infer<typeof statusParamsSchema>;

export interface StatusController {
  getStatus(
    req: FastifyRequest<{ Params: StatusParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply>;
}

export function createStatusController(statusService: EnvelopeStatusService): StatusController {
  return {
    async getStatus(req, reply) {
      const result = await statusService.getStatus(req.params.dealId);
      return reply.status(200).send(result);
    },
  };
}
