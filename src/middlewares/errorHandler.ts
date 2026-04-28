import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors/index.js';

/**
 * Registers a global error handler on the given Fastify instance.
 *
 * Three branches:
 *   1. Fastify schema validation errors (zod via type-provider) → 400 VALIDATION_ERROR
 *   2. Domain AppError subclasses → their own httpStatus + code
 *   3. Anything else → 500 INTERNAL_ERROR (stacktrace logged, NOT sent to client)
 *
 * Controllers MUST NOT use try/catch to build HTTP responses. They let exceptions
 * propagate and this handler does the translation. This keeps controllers thin.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // 1) Schema validation failures from Fastify (zod via type-provider)
      if (error.validation) {
        request.log.warn({ err: error }, 'VALIDATION_ERROR');
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Request inválido',
          details: error.validation,
        });
      }

      // 2) Domain errors (AppError + subclasses)
      if (error instanceof AppError) {
        request.log.warn({ err: error, code: error.code }, error.code);
        return reply.status(error.httpStatus).send({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      // 3) Anything else = bug. NEVER expose details to the client.
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Algo salió mal procesando la solicitud',
      });
    }
  );
}
