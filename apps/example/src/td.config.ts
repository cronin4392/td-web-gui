/**
 * TD instance configuration for the example app (Phase 2.7).
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
  { id: 'example', url: `ws://${host}:${port}` },
] as const satisfies readonly TDInstanceConfig[]

/**
 * How many video tiles the wall is built for (Phase 6.7) — the proposal's
 * "up to 8 streams, all visible at once" target.
 *
 * Kept web-side because it sets `receivers`, the number of recvonly m-lines our
 * SDP offer carries, and that has to be decided *before* TD answers: an answerer
 * can't add m-lines, so anything TD announces beyond this count has nowhere to
 * go. It must therefore be >= the TD project's `STREAMS` count
 * (`td/config-example.py`), which is the one number the two sides must agree on
 * — the ids themselves are discovered at runtime from the `streams` message.
 */
export const VIDEO_TILES = 8

/** Param schema for the `example` instance — one param per bound control kind. */
export interface ExampleParams {
  message: string
  intensity: number
  enabled: boolean
  reset: boolean
  gate: boolean
  mute: boolean
  blendmode: string
  position: number[]
  color: number[]
}
