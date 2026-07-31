/**
 * The pending-call table and named-handler registry behind
 * `connection.call()` / `.notify()` / `.handle()`, in both directions.
 *
 * Knows nothing about `WebSocket`, backpressure, or reconnects: `connection.ts`
 * hands it a `send` that already applies those guards and reports whether the
 * frame went out.
 */

import type { TDScheduler } from './scheduler';
import type { CallMessage, CallResultMessage, JsonValue } from './wire';

/** Outcome of a guarded send, as reported by the connection's send path. */
export type CallSendResult = 'sent' | 'disconnected' | 'congested';

export interface CallOptions {
  /** Override the registry's default timeout for this call only (ms). */
  timeout?: number;
}

export type CallHandler = (
  args: JsonValue | undefined,
) => JsonValue | undefined | void | Promise<JsonValue | undefined | void>;

export interface CallRegistryOptions {
  /** Guarded send of a `call`/`result` frame; reports whether it went out. */
  send: (message: CallMessage | CallResultMessage) => CallSendResult;
  scheduler: TDScheduler;
  /** Default per-call timeout (ms). */
  timeout?: number;
}

export interface CallRegistry {
  call: (name: string, args?: JsonValue, opts?: CallOptions) => Promise<JsonValue | undefined>;
  /** Same `call` message with no `id` — fire-and-forget, no pending entry. */
  notify: (name: string, args?: JsonValue) => void;
  /** Register a named handler; returns an unregister fn (mirrors `subscribe`). */
  handle: (name: string, fn: CallHandler) => () => void;
  /** Feed an inbound `call`/`result` message to the registry. */
  onMessage: (message: CallMessage | CallResultMessage) => void;
  /** Reject every pending call with `call_disconnected`. Call on every socket close. */
  reset: (reason: string) => void;
}

/**
 * Thrown by a rejected `call()`. Carries `.code` (one of the wire error codes
 * or a local-only one — `call_timeout`, `call_disconnected`, `call_congested`)
 * and the `.callName` that failed, so a `catch` can branch on the cause.
 */
export class TDCallError extends Error {
  readonly code: string;
  readonly callName?: string;

  constructor(code: string, callName?: string, message?: string) {
    super(message ?? code);
    this.name = 'TDCallError';
    this.code = code;
    this.callName = callName;
    Object.setPrototypeOf(this, TDCallError.prototype);
  }
}

interface PendingCall {
  resolve: (value: JsonValue | undefined) => void;
  reject: (error: TDCallError) => void;
  name: string;
  timer: number;
}

const DEFAULT_TIMEOUT = 10_000;

export function createCallRegistry(options: CallRegistryOptions): CallRegistry {
  const { send, scheduler } = options;
  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT;

  // Per-connection random prefix + monotonic counter, so ids from a previous
  // connection attempt (before a reconnect) can never collide with the next.
  const idPrefix = Math.random().toString(36).slice(2, 8);
  let counter = 0;

  const pending = new Map<string, PendingCall>();
  const handlers = new Map<string, CallHandler>();

  function nextId(): string {
    counter += 1;
    return `${idPrefix}-${counter}`;
  }

  function call(
    name: string,
    args?: JsonValue,
    opts?: CallOptions,
  ): Promise<JsonValue | undefined> {
    return new Promise((resolve, reject) => {
      const id = nextId();
      const message: CallMessage = {
        type: 'call',
        id,
        name,
        ...(args !== undefined ? { args } : {}),
      };

      // Registered BEFORE the send: a transport that dispatches synchronously
      // (the in-memory mock TD, a same-tick loopback) delivers the `result`
      // inside `send`, and an entry added afterwards would never be settled by
      // it — the call would hang to `call_timeout` with the reply already in
      // hand. Rolled back below if the frame never went out.
      const timer = scheduler.setTimeout(() => {
        pending.delete(id);
        reject(new TDCallError('call_timeout', name));
      }, opts?.timeout ?? defaultTimeout);
      pending.set(id, { resolve, reject, name, timer });

      const result = send(message);
      if (result === 'sent') return;
      if (pending.delete(id)) {
        scheduler.clearTimeout(timer);
        reject(
          new TDCallError(result === 'congested' ? 'call_congested' : 'call_disconnected', name),
        );
      }
    });
  }

  function notify(name: string, args?: JsonValue): void {
    send({ type: 'call', name, ...(args !== undefined ? { args } : {}) });
  }

  function handle(name: string, fn: CallHandler): () => void {
    handlers.set(name, fn);
    return () => {
      if (handlers.get(name) === fn) handlers.delete(name);
    };
  }

  function settle(
    id: string,
    value: JsonValue | undefined,
    error?: { code: string; message?: string },
  ) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    scheduler.clearTimeout(entry.timer);
    if (error) {
      entry.reject(new TDCallError(error.code, entry.name, error.message));
    } else {
      entry.resolve(value);
    }
  }

  function errorResult(id: string, code: string, message?: string): CallResultMessage {
    return { type: 'result', id, error: { code, ...(message !== undefined ? { message } : {}) } };
  }

  async function handleInboundCall(message: CallMessage): Promise<void> {
    const { id, name } = message;
    const fn = handlers.get(name);
    if (!fn) {
      if (id) send(errorResult(id, 'unknown_handler'));
      return;
    }

    let value: JsonValue | undefined;
    try {
      value = (await fn(message.args)) as JsonValue | undefined;
    } catch (error) {
      console.error(`[td-core] handler "${name}" threw`, error);
      if (id) {
        send(
          errorResult(id, 'handler_error', error instanceof Error ? error.message : String(error)),
        );
      }
      return;
    }

    if (!id) return; // fire-and-forget — the caller wants no reply

    try {
      send({ type: 'result', id, ...(value !== undefined ? { value } : {}) });
    } catch {
      // `send` stringifies the envelope, so a cyclic (or BigInt) result throws
      // here — which is the serializability check, with no separate probe pass.
      send(errorResult(id, 'result_not_serializable'));
    }
  }

  function onMessage(message: CallMessage | CallResultMessage): void {
    if (message.type === 'call') {
      void handleInboundCall(message);
    } else {
      settle(message.id, message.value, message.error);
    }
  }

  function reset(reason: string): void {
    for (const entry of pending.values()) {
      scheduler.clearTimeout(entry.timer);
      entry.reject(new TDCallError('call_disconnected', entry.name, reason));
    }
    pending.clear();
  }

  return { call, notify, handle, onMessage, reset };
}
