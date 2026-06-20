/**
 * td-core — reusable Solid.js library for talking to TouchDesigner.
 *
 * Phase 1 is scaffolding only: this module exports one trivial symbol so the
 * build (JSX-preserving + .d.ts), the example app, and Vitest all have
 * something real to exercise. The actual connection/signal/component API lands
 * in Phase 2 onward.
 */

/** Library version marker; replaced by the real API surface in later phases. */
export const version = '0.0.0'

/**
 * Minimal Solid component. Exists so the build emits real (JSX-preserving)
 * component output and the example app can render a `td-core` symbol
 * end-to-end. Renders a bare element with a predictable class hook and no CSS,
 * matching the library's headless styling stance.
 */
export function Hello(props: { name?: string }) {
  return <div class="td-core-hello">td-core says hello{props.name ? `, ${props.name}` : ''}!</div>
}
