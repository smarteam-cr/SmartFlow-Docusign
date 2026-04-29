import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { TemplatesController } from '../controllers/templates.controller.js';
import type { EnvelopesController } from '../controllers/envelopes.controller.js';
import type { ContactsController } from '../controllers/contacts.controller.js';
import { templatesRoutes } from './templates.routes.js';
import { envelopesRoutes } from './envelopes.routes.js';
import { contactsRoutes } from './contacts.routes.js';

export interface V1RoutesOptions {
  templatesController: TemplatesController;
  envelopesController: EnvelopesController;
  contactsController: ContactsController;
}

/**
 * Registers all v1 routes. Mount under '/api/v1' from the composition root.
 */
export const registerV1Routes: FastifyPluginAsync<V1RoutesOptions> = async (
  fastify: FastifyInstance,
  opts: V1RoutesOptions
) => {
  await fastify.register(templatesRoutes, { controller: opts.templatesController });
  await fastify.register(envelopesRoutes, { controller: opts.envelopesController });
  await fastify.register(contactsRoutes, { controller: opts.contactsController });
};
