import { describe, expect, test } from '@jest/globals';
import { AppError } from '../AppError.js';
import { ValidationError } from '../ValidationError.js';
import { NotFoundError } from '../NotFoundError.js';
import { ExternalServiceError } from '../ExternalServiceError.js';
import { ConflictError } from '../ConflictError.js';

describe('AppError', () => {
  test('captures code, httpStatus, message, and details', () => {
    const err = new AppError('SOME_CODE', 418, 'I am a teapot', { foo: 'bar' });
    expect(err.code).toBe('SOME_CODE');
    expect(err.httpStatus).toBe(418);
    expect(err.message).toBe('I am a teapot');
    expect(err.details).toEqual({ foo: 'bar' });
    expect(err.name).toBe('AppError');
  });

  test('is an instance of Error and AppError', () => {
    const err = new AppError('X', 500, 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  test('details is undefined when not provided', () => {
    const err = new AppError('X', 500, 'msg');
    expect(err.details).toBeUndefined();
  });
});

describe('ValidationError', () => {
  test('has httpStatus 422', () => {
    const err = new ValidationError('FOO', 'msg');
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('FOO');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  test('has httpStatus 404', () => {
    const err = new NotFoundError('FOO_NOT_FOUND', 'msg');
    expect(err.httpStatus).toBe(404);
  });
});

describe('ExternalServiceError', () => {
  test('has httpStatus 502', () => {
    const err = new ExternalServiceError('FOO_UNAVAILABLE', 'msg');
    expect(err.httpStatus).toBe(502);
  });
});

describe('ConflictError', () => {
  test('has httpStatus 409', () => {
    const err = new ConflictError('FOO_CONFLICT', 'msg');
    expect(err.httpStatus).toBe(409);
  });
});
