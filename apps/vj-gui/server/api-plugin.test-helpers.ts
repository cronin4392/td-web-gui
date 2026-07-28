import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';

export interface HandlerResult {
  status: number;
  body: string;
  nexted: boolean;
}

export function callHandler(
  handler: Connect.NextHandleFunction,
  method: string,
  url: string,
): HandlerResult {
  const result: HandlerResult = { status: 200, body: '', nexted: false };
  const res = {
    set statusCode(value: number) {
      result.status = value;
    },
    get statusCode() {
      return result.status;
    },
    setHeader: () => undefined,
    end: (body?: string) => {
      result.body = body ?? '';
    },
  } as unknown as ServerResponse;

  handler({ method, url } as IncomingMessage, res, () => {
    result.nexted = true;
  });
  return result;
}
