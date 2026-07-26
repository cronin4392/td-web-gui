/**
 * TD instance configuration for the example app.
 *
 * The instance list lives in the consuming app, not in `td-core` — the library
 * stays config-agnostic and just receives URLs. Host/port are overridable via
 * Vite `import.meta.env` for local tweaks, but resolved at build/startup, not
 * discovered at runtime.
 *
 * The typed param schema for each instance lives beside this config. This app
 * exposes a single instance with one param per bound control kind.
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
 * How many video tiles the wall is built for — the "up to 8 streams, all
 * visible at once" target.
 *
 * Kept web-side because it sets `receivers`, the number of recvonly m-lines our
 * SDP offer carries, and that has to be decided *before* TD answers: an answerer
 * can't add m-lines, so anything TD announces beyond this count has nowhere to
 * go. It must therefore be >= the TD project's `STREAMS` count
 * (`td/config-example.py`, alongside this app), which is the one number the two sides must agree on
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
  /**
   * Audio input device. Typed as a plain `string` like `blendmode`
   * — the difference is entirely in where the *options* come from. `blendmode`'s
   * are hardcoded in `App.tsx`; these can't be, because the keys are
   * machine-specific device GUIDs that change when hardware is plugged in. TD
   * announces them over the `menus` message instead.
   */
  audiodevice: string
}
