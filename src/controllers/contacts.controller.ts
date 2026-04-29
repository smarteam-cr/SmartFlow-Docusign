import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ContactsService } from '../services/index.js';

interface ListDealContactsParams {
  dealId: string;
}

export interface ContactsController {
  listForDeal(
    req: FastifyRequest<{ Params: ListDealContactsParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply>;
}

/**
 * GET /api/v1/hubspot/deals/:dealId/contacts handler.
 * Returns 200 with empty array if the Deal exists but has no contacts (the
 * card handles that as a "warning" empty state). DEAL_NOT_FOUND from the
 * adapter still surfaces as 404; only the empty-list case becomes a 200.
 */
export function createContactsController(service: ContactsService): ContactsController {
  return {
    async listForDeal(req, reply) {
      const contacts = await service.listForDeal(req.params.dealId);
      return reply.status(200).send({ contacts });
    },
  };
}
