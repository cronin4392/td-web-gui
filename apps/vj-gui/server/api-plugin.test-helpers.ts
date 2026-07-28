import { EventEmitter } from 'node:events';
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

/** `callHandler`, but for a request with a body: passes `body` through the
 * `req.on('data'|'end')` stream a handler's `readBody` helper expects. */
export async function callHandlerWithBody(
  handler: Connect.NextHandleFunction,
  method: string,
  url: string,
  body: string,
): Promise<HandlerResult> {
  const result: HandlerResult = { status: 200, body: '', nexted: false };
  const res = {
    set statusCode(value: number) {
      result.status = value;
    },
    get statusCode() {
      return result.status;
    },
    setHeader: () => undefined,
    end: (responseBody?: string) => {
      result.body = responseBody ?? '';
    },
  } as unknown as ServerResponse;

  const req = new EventEmitter() as IncomingMessage;
  Object.assign(req, { method, url });

  await new Promise<void>((resolveDone) => {
    const maybePromise = handler(req, res, () => {
      result.nexted = true;
      resolveDone();
    });
    if (maybePromise && typeof (maybePromise as unknown as Promise<void>).then === 'function') {
      (maybePromise as unknown as Promise<void>).then(() => resolveDone());
    }
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  });
  return result;
}

export interface StreamedHandlerResult extends HandlerResult {
  headers: Record<string, string>;
}

/** `callHandler` for an async handler that may stream its response via
 * `res.write`/`.pipe()` rather than a single `res.end(body)` call. */
export function callStreamingHandler(
  handler: Connect.NextHandleFunction,
  method: string,
  url: string,
): Promise<StreamedHandlerResult> {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];

  class FakeResponse extends EventEmitter {
    statusCode = 200;
    writable = true;
    setHeader(key: string, value: string): void {
      headers[key] = value;
    }
    write(chunk: unknown, ...args: unknown[]): boolean {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const cb = args.find((a): a is () => void => typeof a === 'function');
      cb?.();
      return true;
    }
    end(chunk?: unknown, ...args: unknown[]): void {
      if (chunk !== undefined && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      this.emit('finish');
      const cb = args.find((a): a is () => void => typeof a === 'function');
      cb?.();
    }
  }

  const res = new FakeResponse();

  return new Promise<StreamedHandlerResult>((resolveResult) => {
    let nexted = false;
    res.once('finish', () => {
      resolveResult({
        status: res.statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
        nexted,
      });
    });
    handler({ method, url } as IncomingMessage, res as unknown as ServerResponse, () => {
      nexted = true;
      resolveResult({
        status: res.statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
        nexted,
      });
    });
  });
}
