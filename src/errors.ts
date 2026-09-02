export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
  }
}
