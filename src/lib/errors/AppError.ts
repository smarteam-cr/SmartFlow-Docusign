/**
 * Base class for all domain/business errors.
 * Carries a stable `code`, an HTTP status, and optional structured `details`.
 *
 * Subclasses fix the httpStatus and let callers focus on `code` + `message`.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  constructor(code: string, httpStatus: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = this.constructor.name;
    // Required to keep the prototype chain in TS when targeting ES5+
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
