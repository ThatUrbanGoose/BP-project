export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

type ApiErrorOptions = {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly statusCode: number;

  readonly code: ApiErrorCode;

  readonly details: unknown;

  constructor(
    options: ApiErrorOptions,
  ) {
    super(options.message);

    this.name = "ApiError";

    this.statusCode =
      options.statusCode;

    this.code =
      options.code;

    this.details =
      options.details;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}
