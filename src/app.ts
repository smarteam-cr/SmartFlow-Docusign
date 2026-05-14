import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { Env } from './config/env.js';
import { createEnvTenantConfigProvider } from './lib/tenant-config/index.js';
import { createStaticTemplateMappingResolver } from './lib/template-mapping/index.js';
import { createStaticTemplateRolesResolver } from './lib/template-roles/index.js';
import { createHubSpotAdapter } from './integrations/HS/index.js';
import { createDocusignAdapter } from './integrations/Docusign/index.js';
import {
  createTemplatesService,
  createEnvelopesService,
  createContactsService,
} from './services/index.js';
import { createTemplatesController } from './controllers/templates.controller.js';
import { createEnvelopesController } from './controllers/envelopes.controller.js';
import { createContactsController } from './controllers/contacts.controller.js';
import { registerV1Routes } from './routes/index.js';
import { registerErrorHandler } from './middlewares/errorHandler.js';

export const APP_VERSION = '1.2.0';

/**
 * Builds and returns a Fastify instance fully wired with adapters, services,
 * controllers, routes, and the global error handler.
 *
 * THIS is the only place that calls factory functions across layers. Every
 * adapter, service, controller, and route is constructed and connected here.
 *
 * `server.ts` calls this and then `.listen()` on the result.
 */
export async function buildApp(env: Env): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Redact sensitive paths from any log line (defensive against secrets
      // leaking into 5xx traces, especially around HubSpot/DocuSign auth).
      redact: {
        paths: [
          'req.headers.authorization',
          'err.config.headers.authorization',
          'err.request.headers.authorization',
          '*.access_token',
          '*.privateKey',
          '*.DOCUSIGN_PRIVATE_KEY',
          '*.HUBSPOT_ACCESS_TOKEN',
        ],
        censor: '[REDACTED]',
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  // 1) zod type-provider compilers (request body / response validation)
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // HubSpot's `hubspot.fetch` strips the Content-Type header (only Authorization
  // is allowed). The body still arrives as a JSON string, so we register a
  // catch-all parser that JSON-parses any body that isn't already handled.
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (!body) return done(null, undefined);
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // 2) Global error handler (AppError → HTTP)
  registerErrorHandler(fastify);

  // 3) Wire the dependency graph
  const tenantConfig = createEnvTenantConfigProvider(env).getConfig();

  const hubspot = createHubSpotAdapter(tenantConfig.hubspot);
  const docusign = createDocusignAdapter(tenantConfig.docusign);
  const templateMapping = createStaticTemplateMappingResolver();
  const templateRoles = createStaticTemplateRolesResolver(env.TEMPLATE_PROVEEDOR_MAP);

  const templatesService = createTemplatesService({ docusign });
  const envelopesService = createEnvelopesService({
    hubspot,
    docusign,
    templateMapping,
    templateRoles,
  });

  const templatesController = createTemplatesController(templatesService);
  const envelopesController = createEnvelopesController(envelopesService);
  const contactsService = createContactsService({ hubspot });
  const contactsController = createContactsController(contactsService);

  // 4) Register v1 routes under /api/v1
  await fastify.register(
    async (instance) => {
      await instance.register(registerV1Routes, {
        templatesController,
        envelopesController,
        contactsController,
      });
    },
    { prefix: '/api/v1' }
  );

  // 5) Health endpoint (no auth, no version negotiation)
  fastify.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    version: APP_VERSION,
  }));

  return fastify;
}
