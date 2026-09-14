export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

export function httpError(status: number, code: string, message: string, field?: string | null): never {
  throw new HttpError(status, code, message, field ?? null);
}
