import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 404, message, details);
  }
}
