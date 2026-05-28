import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  sendContextParamsSchema,
  type SendContextController,
} from '../controllers/send-context.controller.js';

export interface SendContextRoutesOptions {
  controller: SendContextController;
}

export const sendContextRoutes: FastifyPluginAsync<SendContextRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: SendContextRoutesOptions
) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/deals/:dealId/send-context',
    {
      schema: {
        params: sendContextParamsSchema,
      },
    },
    opts.controller.getSendContext
  );
};
