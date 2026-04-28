import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  sendEnvelopeBodySchema,
  type EnvelopesController,
} from '../controllers/envelopes.controller.js';

export interface EnvelopesRoutesOptions {
  controller: EnvelopesController;
}

/**
 * Registers POST /docusign/envelopes with zod validation on body.
 * The /api/v1 prefix is applied by routes/index.ts when registering this plugin.
 */
export const envelopesRoutes: FastifyPluginAsync<EnvelopesRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: EnvelopesRoutesOptions
) => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/docusign/envelopes',
    {
      schema: {
        body: sendEnvelopeBodySchema,
      },
    },
    opts.controller.send
  );
};
