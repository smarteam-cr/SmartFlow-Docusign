import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}
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
import { createHubSpotFilesAdapter } from './integrations/HS/hubspot-files.adapter.js';
import { createDocusignAdapter } from './integrations/Docusign/index.js';
import {
  createTemplatesService,
  createEnvelopesService,
  createContactsService,
} from './services/index.js';
import { createEnvelopeLifecycleService } from './services/envelope-lifecycle.service.js';
import { createTemplatesController } from './controllers/templates.controller.js';
import { createEnvelopesController } from './controllers/envelopes.controller.js';
import { createContactsController } from './controllers/contacts.controller.js';
import { createWebhooksController } from './controllers/webhooks.controller.js';
import { registerV1Routes } from './routes/index.js';
import { registerWebhookRoutes } from './routes/webhooks.routes.js';
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
    (req, body, done) => {
      if (!body) return done(null, undefined);
      const raw = body as string;
      (req as FastifyRequest & { rawBody?: string }).rawBody = raw;
      try {
        done(null, JSON.parse(raw));
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
  const hubspotFiles = createHubSpotFilesAdapter(tenantConfig.hubspot);
  const docusign = createDocusignAdapter(tenantConfig.docusign);
  const templateMapping = createStaticTemplateMappingResolver();
  const templateRoles = createStaticTemplateRolesResolver(env.TEMPLATE_PROVEEDOR_MAP);

  const templatesService = createTemplatesService({ docusign });
  const envelopesService = createEnvelopesService({
    hubspot,
    docusign,
    templateMapping,
    templateRoles,
    portalId: env.HUBSPOT_PORTAL_ID,
  });
  const lifecycleService = createEnvelopeLifecycleService({
    hubspot,
    hubspotFiles,
    docusign,
  });

  const templatesController = createTemplatesController(templatesService);
  const envelopesController = createEnvelopesController(envelopesService);
  const contactsService = createContactsService({ hubspot });
  const contactsController = createContactsController(contactsService);
  const webhooksController = createWebhooksController({
    lifecycleService,
    hmacSecret: env.DOCUSIGN_CONNECT_HMAC_SECRET,
  });

  // 4) Register v1 routes under /api/v1
  await fastify.register(
    async (instance) => {
      await instance.register(registerV1Routes, {
        templatesController,
        envelopesController,
        contactsController,
      });
      await registerWebhookRoutes(instance, { webhooksController });
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
