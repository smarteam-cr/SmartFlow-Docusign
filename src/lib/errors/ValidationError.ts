import { AppError } from './AppError.js';

export class ValidationError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 422, message, details);
  }
}
