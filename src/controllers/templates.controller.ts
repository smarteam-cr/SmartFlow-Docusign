import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TemplatesService } from '../services/index.js';

export interface TemplatesController {
  list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply>;
}

/**
 * GET /api/v1/docusign/templates handler.
 * Delegates to the service and shapes the response as { templates: [...] }.
 */
export function createTemplatesController(service: TemplatesService): TemplatesController {
  return {
    async list(_req, reply) {
      const templates = await service.list();
      return reply.status(200).send({ templates });
    },
  };
}
