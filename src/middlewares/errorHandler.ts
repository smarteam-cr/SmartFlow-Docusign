import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors/index.js';

function isValidationError(err: FastifyError): boolean {
  return (
    Boolean(err.validation) ||
    err.code === 'FST_ERR_VALIDATION' ||
    err.name === 'ZodError'
  );
}

/**
 * Registers a global error handler on the given Fastify instance.
 *
 * Four branches:
 *   1. Fastify schema validation errors (zod via type-provider) → 400 VALIDATION_ERROR
 *   2. Domain AppError subclasses → their own httpStatus + code
 *   3. Other client errors with explicit 4xx statusCode (e.g., body parse) → that 4xx
 *   4. Anything else → 500 INTERNAL_ERROR (stacktrace logged, NOT sent to client)
 *
 * Controllers MUST NOT use try/catch to build HTTP responses. They let exceptions
 * propagate and this handler does the translation. This keeps controllers thin.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // 1) Schema validation failures from Fastify (zod via type-provider)
      if (isValidationError(error)) {
        request.log.warn({ err: error }, 'VALIDATION_ERROR');
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Request inválido',
          details: error.validation ?? (error as unknown as { issues?: unknown }).issues,
          requestId: request.id,
        });
      }

      // 2) Domain errors (AppError + subclasses)
      if (error instanceof AppError) {
        request.log.warn({ err: error, code: error.code }, error.code);
        return reply.status(error.httpStatus).send({
          error: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
        });
      }

      // 3) Other client-side failures Fastify decorated with a 4xx status, e.g.
      //    body parse failures (malformed JSON). Respect the status, surface a
      //    safe code + message — never a 500 for a client mistake.
      if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
        request.log.warn({ err: error, statusCode: error.statusCode }, error.code ?? 'CLIENT_ERROR');
        return reply.status(error.statusCode).send({
          error: error.code ?? 'BAD_REQUEST',
          message: error.message,
          requestId: request.id,
        });
      }

      // 4) Anything else = bug. NEVER expose details to the client.
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Algo salió mal procesando la solicitud',
        requestId: request.id,
      });
    }
  );
}
