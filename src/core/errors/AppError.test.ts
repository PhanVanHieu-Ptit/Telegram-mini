import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  internal,
} from './AppError';

describe('AppError', () => {
  it('sets message, statusCode, errorCode, isOperational', () => {
    const err = new AppError('something went wrong', 500, 'INTERNAL_ERROR', false);
    expect(err.message).toBe('something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(false);
    expect(err.name).toBe('AppError');
  });

  it('defaults isOperational to true', () => {
    const err = new AppError('oops', 400, 'BAD_REQUEST');
    expect(err.isOperational).toBe(true);
  });

  it('is an instance of Error', () => {
    const err = new AppError('msg', 400, 'BAD_REQUEST');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('captures stack trace', () => {
    const err = new AppError('trace', 400, 'BAD_REQUEST');
    expect(err.stack).toBeDefined();
  });
});

describe('ValidationError', () => {
  it('has statusCode 400 and correct codes', () => {
    const err = new ValidationError('invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('invalid input');
  });

  it('is instanceof AppError and Error', () => {
    const err = new ValidationError('x');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('UnauthorizedError', () => {
  it('defaults message to "Unauthorized"', () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe('Unauthorized');
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('UNAUTHORIZED');
  });

  it('accepts custom message', () => {
    const err = new UnauthorizedError('not allowed');
    expect(err.message).toBe('not allowed');
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404', () => {
    const err = new NotFoundError('user not found');
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe('NOT_FOUND');
    expect(err.message).toBe('user not found');
    expect(err.name).toBe('NotFoundError');
  });
});

describe('factory helpers', () => {
  it('badRequest: 400 BAD_REQUEST', () => {
    const err = badRequest('bad');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('BAD_REQUEST');
  });

  it('unauthorized: 401 UNAUTHORIZED', () => {
    const err = unauthorized('unauth');
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('UNAUTHORIZED');
  });

  it('forbidden: 403 FORBIDDEN', () => {
    const err = forbidden('nope');
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('FORBIDDEN');
  });

  it('notFound: 404 NOT_FOUND', () => {
    const err = notFound('gone');
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe('NOT_FOUND');
  });

  it('internal: 500, isOperational false', () => {
    const err = internal('crash');
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(false);
  });
});
