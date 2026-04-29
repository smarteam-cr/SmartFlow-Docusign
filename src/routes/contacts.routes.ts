import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ContactsController } from '../controllers/contacts.controller.js';

export interface ContactsRoutesOptions {
  controller: ContactsController;
}

const paramsSchema = z.object({
  dealId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9]+$/, 'dealId debe ser numérico'),
});

/**
 * Registers GET /hubspot/deals/:dealId/contacts.
 * The /api/v1 prefix is applied by routes/index.ts.
 */
export const contactsRoutes: FastifyPluginAsync<ContactsRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: ContactsRoutesOptions
) => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/hubspot/deals/:dealId/contacts',
    {
      schema: {
        params: paramsSchema,
      },
    },
    opts.controller.listForDeal
  );
};
