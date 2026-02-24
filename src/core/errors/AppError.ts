export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    errorCode: ErrorCode,
    isOperational = true,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR", true);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED", true);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND", true);
    this.name = "NotFoundError";
  }
}

export const badRequest = (message = "Bad Request", errorCode: ErrorCode = "BAD_REQUEST") =>
  new AppError(message, 400, errorCode, true);

export const unauthorized = (message = "Unauthorized", errorCode: ErrorCode = "UNAUTHORIZED") =>
  new AppError(message, 401, errorCode, true);

export const forbidden = (message = "Forbidden", errorCode: ErrorCode = "FORBIDDEN") =>
  new AppError(message, 403, errorCode, true);

export const notFound = (message = "Not Found", errorCode: ErrorCode = "NOT_FOUND") =>
  new AppError(message, 404, errorCode, true);

export const internal = (message = "Internal Server Error", errorCode: ErrorCode = "INTERNAL_ERROR") =>
  new AppError(message, 500, errorCode, false);
