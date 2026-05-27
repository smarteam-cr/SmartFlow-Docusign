import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  voidEnvelopeBodySchema,
  voidEnvelopeParamsSchema,
  type VoidController,
} from '../controllers/void.controller.js';

export interface VoidRoutesOptions {
  controller: VoidController;
}

export const voidRoutes: FastifyPluginAsync<VoidRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: VoidRoutesOptions
) => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/docusign/envelopes/:envelopeId/void',
    {
      schema: {
        body: voidEnvelopeBodySchema,
        params: voidEnvelopeParamsSchema,
      },
    },
    opts.controller.void
  );
};
