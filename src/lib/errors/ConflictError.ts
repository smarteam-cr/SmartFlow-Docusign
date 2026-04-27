import { AppError } from './AppError.js';

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 409, message, details);
  }
}
