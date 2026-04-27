import { AppError } from './AppError.js';

export class ExternalServiceError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 502, message, details);
  }
}
