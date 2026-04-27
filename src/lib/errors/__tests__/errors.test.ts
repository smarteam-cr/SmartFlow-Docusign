import { describe, expect, test } from '@jest/globals';
import { AppError } from '../AppError.js';

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
