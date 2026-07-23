/**
 * TD instance configuration for the text-selector app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * The typed param schema for each instance lives beside this config; in Phase 2
 * we expose a single instance with a text and a number param.
 */

/** Static `{ id, url }` descriptor for one TD instance's Web Server DAT. */
export interface TDInstanceConfig {
  id: string
  url: string
}

const host = import.meta.env.VITE_TD_HOST ?? 'localhost'
const port = import.meta.env.VITE_TD_PORT ?? '9980'

export const instances = [
  { id: 'text-selector', url: `ws://${host}:${port}` },
] as const satisfies readonly TDInstanceConfig[]

/** Param schema for the `text-selector` instance. */
export interface TextSelectorParams {
  text1: string;
  text2: string;
}
