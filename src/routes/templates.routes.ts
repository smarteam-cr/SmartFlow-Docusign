import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { TemplatesController } from '../controllers/templates.controller.js';

export interface TemplatesRoutesOptions {
  controller: TemplatesController;
}

/**
 * Registers GET /docusign/templates.
 * The /api/v1 prefix is applied by routes/index.ts when registering this plugin.
 */
export const templatesRoutes: FastifyPluginAsync<TemplatesRoutesOptions> = async (
  fastify: FastifyInstance,
  opts: TemplatesRoutesOptions
) => {
  fastify.get('/docusign/templates', opts.controller.list);
};
