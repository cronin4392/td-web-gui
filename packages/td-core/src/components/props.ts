/**
 * Shared prop plumbing for the bundled controls.
 */

/**
 * Invoke a Solid event handler prop (plain function or `[handler, data]` bound
 * tuple), if the consumer passed one. Loosely typed because Solid's per-element
 * handler unions don't unify across a generic call site.
 */
export function callHandler(handler: unknown, event: Event): void {
  if (!handler) return;
  if (typeof handler === 'function') (handler as (e: Event) => void)(event);
  else if (Array.isArray(handler)) {
    (handler[0] as (data: unknown, e: Event) => void)(handler[1], event);
  }
}

/**
 * Combine the library's styling hook with whatever `class` the consumer passed.
 *
 * Rendered *after* the prop spread so it wins: a bare `class="td-toggle"` before
 * `{...rest}` is overwritten by a consumer `class`, silently dropping the hook
 * every documented `.td-*` selector depends on.
 */
export function mergeClass(hook: string, provided: unknown): string {
  return typeof provided === 'string' && provided !== '' ? `${hook} ${provided}` : hook;
}
