import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  statusParamsSchema,
  type StatusController,
} from '../controllers/status.controller.js';

export interface StatusRoutesOptions {
  controller: StatusController;
}

export const statusRoutes: FastifyPluginAsync<StatusRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: StatusRoutesOptions
) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/deals/:dealId/envelope-status',
    {
      schema: {
        params: statusParamsSchema,
      },
    },
    opts.controller.getStatus
  );
};
