import type { FastifyInstance } from 'fastify';
import type { WebhooksController } from '../controllers/webhooks.controller.js';

export async function registerWebhookRoutes(
  instance: FastifyInstance,
  opts: { webhooksController: WebhooksController }
) {
  instance.post('/webhooks/docusign', opts.webhooksController.handleDocusign);
}
