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
import { createStaticTeamCountryResolver } from './lib/team-country/index.js';
import {
  createHubSpotAdapter,
  createHubSpotTemplateRolesResolver,
} from './integrations/HS/index.js';
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
import { createVoidController } from './controllers/void.controller.js';
import { createStatusController } from './controllers/status.controller.js';
import { createSendContextController } from './controllers/send-context.controller.js';
import { createEnvelopeStatusService } from './services/envelope-status.service.js';
import { createSendContextService } from './services/send-context.service.js';
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

  // Parse JSON bodies AND capture the raw string for HMAC verification.
  // Overrides Fastify's built-in application/json parser so rawBody is always available.
  // Also handles HubSpot's hubspot.fetch which strips Content-Type (arrives as */octet-stream).
  function rawBodyParser(req: FastifyRequest, body: string, done: (err: Error | null, result?: unknown) => void) {
    if (!body) return done(null, undefined);
    req.rawBody = body;
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      done(err as Error, undefined);
    }
  }

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, rawBodyParser);
  fastify.addContentTypeParser('*', { parseAs: 'string' }, rawBodyParser);

  // 2) Global error handler (AppError → HTTP)
  registerErrorHandler(fastify);

  // 3) Wire the dependency graph
  const tenantConfig = createEnvTenantConfigProvider(env).getConfig();

  const hubspot = createHubSpotAdapter(tenantConfig.hubspot);
  const hubspotFiles = createHubSpotFilesAdapter(tenantConfig.hubspot);
  const docusign = createDocusignAdapter(tenantConfig.docusign);
  const templateMapping = createStaticTemplateMappingResolver();
  const templateRoles = createHubSpotTemplateRolesResolver({ hubspot });
  const teamCountry = createStaticTeamCountryResolver();

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

  const statusService = createEnvelopeStatusService({ hubspot });
  const sendContextService = createSendContextService({ hubspot, docusign, teamCountry });

  const templatesController = createTemplatesController(templatesService);
  const envelopesController = createEnvelopesController(envelopesService);
  const contactsService = createContactsService({ hubspot });
  const contactsController = createContactsController(contactsService);
  const voidController = createVoidController(envelopesService);
  const statusController = createStatusController(statusService);
  const sendContextController = createSendContextController(sendContextService);
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
        voidController,
        statusController,
        sendContextController,
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
