import { describe, expect, jest, test } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createWebhooksController } from '../webhooks.controller.js';
import type { EnvelopeLifecycleService } from '../../services/envelope-lifecycle.service.js';

const HMAC_SECRET = 'test-secret';

function sign(body: string): string {
  return createHmac('sha256', HMAC_SECRET).update(body, 'utf8').digest('base64');
}

function makeFakeLifecycle(): EnvelopeLifecycleService {
  return {
    handleEvent: jest.fn<EnvelopeLifecycleService['handleEvent']>().mockResolvedValue(undefined),
  };
}

function makeFakeReply() {
  const code = jest.fn();
  const send = jest.fn();
  const reply = { code, send };
  code.mockReturnValue(reply);
  send.mockReturnValue(reply);
  return reply;
}

const validPayload = {
  event: 'envelope-completed',
  data: {
    envelopeId: 'env-001',
    envelopeSummary: {
      status: 'completed',
      customFields: {
        textCustomFields: [
          { name: 'hubspot_deal_id', value: 'd-1' },
          { name: 'hubspot_portal_id', value: 'p-1' },
        ],
      },
    },
  },
};

describe('WebhooksController.handleDocusign', () => {
  test('returns 401 when HMAC is invalid', async () => {
    const lifecycle = makeFakeLifecycle();
    const controller = createWebhooksController({ lifecycleService: lifecycle, hmacSecret: HMAC_SECRET });
    const reply = makeFakeReply();
    const request = {
      rawBody: JSON.stringify(validPayload),
      headers: { 'x-docusign-signature-1': 'wrong-signature' },
      body: validPayload,
    };

    await controller.handleDocusign(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'WEBHOOK_HMAC_INVALID' });
    expect(lifecycle.handleEvent).not.toHaveBeenCalled();
  });

  test('returns 401 when signature header is missing', async () => {
    const lifecycle = makeFakeLifecycle();
    const controller = createWebhooksController({ lifecycleService: lifecycle, hmacSecret: HMAC_SECRET });
    const reply = makeFakeReply();
    const request = {
      rawBody: JSON.stringify(validPayload),
      headers: {},
      body: validPayload,
    };

    await controller.handleDocusign(request as any, reply as any);
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  test('returns 200 and calls lifecycleService.handleEvent on valid HMAC + payload', async () => {
    const lifecycle = makeFakeLifecycle();
    const controller = createWebhooksController({ lifecycleService: lifecycle, hmacSecret: HMAC_SECRET });
    const reply = makeFakeReply();
    const bodyStr = JSON.stringify(validPayload);
    const request = {
      rawBody: bodyStr,
      headers: { 'x-docusign-signature-1': sign(bodyStr) },
      body: validPayload,
    };

    await controller.handleDocusign(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ received: true });
    expect(lifecycle.handleEvent).toHaveBeenCalledWith(expect.objectContaining({
      envelopeId: 'env-001',
      status: 'completed',
      dealId: 'd-1',
      portalId: 'p-1',
    }));
  });

  test('returns 422 when payload is missing envelopeId', async () => {
    const lifecycle = makeFakeLifecycle();
    const controller = createWebhooksController({ lifecycleService: lifecycle, hmacSecret: HMAC_SECRET });
    const reply = makeFakeReply();
    const badPayload = { event: 'envelope-completed', data: {} };
    const bodyStr = JSON.stringify(badPayload);
    const request = {
      rawBody: bodyStr,
      headers: { 'x-docusign-signature-1': sign(bodyStr) },
      body: badPayload,
    };

    await controller.handleDocusign(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({ error: 'WEBHOOK_PAYLOAD_INVALID' });
    expect(lifecycle.handleEvent).not.toHaveBeenCalled();
  });
});
