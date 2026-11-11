# CSS Architecture: Tokens + Cascade Layers + CSS Modules

Status: implemented 2026-08-09. Three things the audit below missed, resolved
during the conversion:

- **App background.** `index.html` carried `bg-neutral-900 text-neutral-100`,
  which no token covered. Collapsed into `--color-canvas` rather than adding a
  ninth primitive — so the app ground goes `#171717` → `#000000`. Reversible
  by one token edit if it reads too hard.
- **Motion.** `LayerPreviews`' stat overlay does use `transition-opacity`, so
  the "no transitions anywhere" claim was wrong. Left untokenized and
  hardcoded as `150ms` in that module; the Non-Goal stands.
- **Untokenized colors.** The health dots (`green-400`, `amber-400`) and
  `ring-black/50` are hardcoded in `LayerPreviews.module.css`; `white`/`black`
  in `RadioButton` map to `--color-text` / `--color-canvas`.

Two additions to the plan as written: a `.u-sr-only` utility (Tailwind's
`sr-only` was in use by `RadioButton` and two `<legend>`s), and `index.css`
moved to the **first** import in `index.tsx` — a layer's position is fixed
where it is first named, so the `@layer` statement has to reach the document
ahead of any `@layer components` module.

`apps/example` was never on Tailwind (it is already plain CSS), so the
"stays on Tailwind" scope note was moot.

## Goal

Move `apps/vj-gui` off Tailwind onto vanilla CSS driven by a small set of
global design tokens (CSS custom properties), so that changing one token
value trickles through every consumer via the cascade instead of requiring a
find-and-replace across utility-class strings. Component-level scoping is
handled by CSS Modules, which Vite supports natively — no new runtime
dependency.

## Decisions

These were settled before writing this spec; later sections build on them
without re-litigating:

- **Scope**: `apps/vj-gui` only. `apps/example` stays on Tailwind — it's
  reference material for `td-core` consumers, and migrating it is a separate,
  later decision.
- **Token structure**: two-tier for color only — hand-authored
  **primitives** (raw scale values) aliased into **semantic tokens**
  (role-named, e.g. `--color-surface`). Everything else (spacing, text
  size, font weight, font family, radius) is **single-tier**: a small fixed
  set referenced directly from component CSS, no semantic aliasing layer.
  No external token library (ruled out Open Props to avoid a dependency
  neither necessary nor requested).
- **Token count is the priority over pixel-perfect parity**: every category
  is deliberately kept as small as the current UI allows, collapsing
  near-duplicate values where the visual difference is minor. See Token
  Taxonomy below for the full, final list — audit it and cut further if
  anything still looks unnecessary.
- **`video-tile` / `video-overlay`**: resolved — these move from the global
  `index.css` into `LayerPreviews.module.css` as part of that component's
  conversion (no more plain-string global classes).
- **Component scoping**: CSS Modules (native Vite), not a CSS-in-JS library.
  `solid-styled` was considered and rejected — single maintainer, ~300 weekly
  downloads, not the "industry standard" bar this was measured against.
- **Rollout**: big-bang. Scaffold the token/layer/reset foundation, convert
  every component in one pass, remove Tailwind in the same effort. No
  near-term show constrains the timeline, so there's no reason to run two
  styling systems side by side longer than necessary.
- **Browser target**: current desktop Chrome/Edge (evergreen). vj-gui runs as
  a normal browser tab controlling TD over the wire, not inside TD's embedded
  CEF panel — so native CSS nesting, `@layer`, and `color-mix()` are safe to
  use directly, no fallback tier needed.
- **Reset**: a small hand-written reset in its own layer, replacing Tailwind
  Preflight. Scoped to what this app actually needs, not a general-purpose
  normalize.

## Current State (audited 2026-08-09)

- Tailwind 4 via `@tailwindcss/vite`; `src/index.css` is just
  `@import 'tailwindcss';` plus two hand-written classes (`.video-tile
.td-video`, `.video-overlay`) that already prove out plain CSS works fine
  alongside it.
- 71 `class="..."` call sites across 12 files (`App.tsx` and everything under
  `catalog/`, `wordbank/`, `playback/`, `ui/`).
- No CSS Modules, no design tokens, no `@layer` usage today.
- Utility usage is consistent enough to read off a real scale rather than
  invent one. Grouped from the current codebase:

  | Category                   | Values actually in use                                                |
  | -------------------------- | --------------------------------------------------------------------- |
  | Grayscale (bg/border/text) | `neutral-{100,300,400,500,600,700,800}`, `black`, `black/60`, `white` |
  | Accent colors              | `red-400` (destructive/hover), `blue-400` (active/selected indicator) |
  | Spacing                    | `0.5, 1, 2, 3, 4, 6, 16, 24` (Tailwind units → `0.125rem` … `6rem`)   |
  | Font size                  | `text-xs`, `text-sm` (no larger sizes used anywhere)                  |
  | Font weight/family         | `font-semibold`, `font-mono`                                          |
  | Radius                     | `rounded` (default), `rounded-t`, `rounded-md`                        |
  | Border width               | `border` (1px), `border-2`                                            |
  | z-index                    | one usage: `z-10` (the clear button in `TextField.tsx`)               |

  No transition/duration/easing utilities appear anywhere in the app today —
  motion tokens are deliberately **not** part of the initial scale (see
  Non-Goals).

## Target Architecture

### Cascade layers

Declared once, in order, at the top of the app's entry CSS:

```css
@layer tokens, reset, base, components, utilities;
```

Order — not specificity — decides who wins. Every component's CSS Module
lands in `components`; the small number of one-off overrides that Tailwind
utilities currently serve (see below) land in `utilities`, so they still win
regardless of how specific a component's own selectors get.

| Layer        | Contents                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`     | `:root` custom-property declarations only. No selectors beyond `:root`.                                                                                                                                                                                   |
| `reset`      | The hand-written reset (box-sizing, margin removal, form-control inheritance, `html`/`body`/`#root` height).                                                                                                                                              |
| `base`       | Bare-element defaults for this app (body font, background/text color from semantic tokens).                                                                                                                                                               |
| `components` | One file per component, via CSS Modules.                                                                                                                                                                                                                  |
| `utilities`  | A handful of single-purpose override classes — e.g. `.u-hidden { display: none; }`, replacing the two current bare `hidden` Tailwind utility usages (`App.tsx:41`, `TabStrip.tsx:159`). Kept intentionally tiny; this is not a rebuilt utility framework. |

### Token tiers

**Colors** are two-tier: hand-authored **primitives** (raw scale, never
referenced directly from component CSS) aliased into **semantic tokens**
(the only color tokens component CSS is allowed to reference). This is what
makes the cascade actually useful day to day — retheming or adjusting
contrast means editing the semantic alias, not hunting every component file
— and it means a future light/dark mode (not in scope now) is a second
`:root` block away.

**Spacing and text size** are single-tier — component CSS references
`--spacing-s/m/l` and `--text-s/m` directly. No semantic aliasing layer for
these; a fixed 3-value and 2-value scale doesn't need one, and adding aliases
would just be indirection with no payoff.

## Token Taxonomy (full list — audit this)

Every token the migration is expected to need. Anything not on this list
gets hardcoded per-component rather than tokenized (see "Not tokenized"
below) — the goal is the smallest set that still covers the app, not
maximum coverage.

#### Color primitives (8)

| Token        | Value     | Backs                          |
| ------------ | --------- | ------------------------------ |
| `--gray-100` | `#f5f5f5` | primary text                   |
| `--gray-400` | `#a3a3a3` | muted text                     |
| `--gray-500` | `#737373` | faint text, hover border       |
| `--gray-700` | `#404040` | default border                 |
| `--gray-800` | `#262626` | surfaces (panels/inputs/tiles) |
| `--black`    | `#000000` | canvas, overlay                |
| `--blue-400` | `#60a5fa` | accent                         |
| `--red-400`  | `#f87171` | danger                         |

#### Color semantics (10)

| Token                  | Value              | Replaces (current Tailwind)                | Regression                                              |
| ---------------------- | ------------------ | ------------------------------------------ | ------------------------------------------------------- |
| `--color-text`         | `var(--gray-100)`  | `text-neutral-100`, `hover:text-white`     | white→`#f5f5f5` on tab hover, negligible                |
| `--color-text-muted`   | `var(--gray-400)`  | `text-neutral-300`, `text-neutral-400`     | neutral-300 sites get slightly darker                   |
| `--color-text-faint`   | `var(--gray-500)`  | `text-neutral-500`                         | none                                                    |
| `--color-surface`      | `var(--gray-800)`  | `bg-neutral-800`                           | none                                                    |
| `--color-canvas`       | `var(--black)`     | `bg-black` (video tile bg)                 | none                                                    |
| `--color-overlay`      | `rgb(0 0 0 / 60%)` | `bg-black/60` (video overlay scrim)        | none                                                    |
| `--color-border`       | `var(--gray-700)`  | `border-neutral-700`, `border-neutral-600` | neutral-600 sites (inputs) get a slightly darker border |
| `--color-border-hover` | `var(--gray-500)`  | `hover:border-neutral-500`                 | none                                                    |
| `--color-accent`       | `var(--blue-400)`  | `bg-blue-400` (drag-reorder indicator)     | none                                                    |
| `--color-danger`       | `var(--red-400)`   | `text-red-400`                             | none                                                    |

#### Spacing (3, single-tier)

| Token         | Value     | Replaces                                                                                         | Regression                                                                                            |
| ------------- | --------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `--spacing-s` | `0.25rem` | `px-1`, `py-1`, `gap-1`, `pt-1`, `pl-1`, `pr-1` (exact), plus `py-0.5` / `0.125rem` (rounded up) | `py-0.5` sites get very slightly more padding                                                         |
| `--spacing-m` | `0.5rem`  | `gap-2`, `mt-2`, `pt-2` (exact), plus `gap-3` / `0.75rem` (rounded down)                         | `gap-3` sites get slightly tighter gaps                                                               |
| `--spacing-l` | `1rem`    | `gap-4`, `h-4`, `w-4` (exact), plus `mt-6` / `1.5rem` (rounded down)                             | `mt-6` is on the debug paragraph in `App.tsx:41`, which is currently `hidden` — effectively invisible |

`w-24` (TabStrip rename input width) and `pr-16` (TextField clear-button
clearance) are fixed component dimensions, not part of the spacing rhythm —
hardcode them in the relevant module CSS rather than forcing one-off sizes
into this 3-step scale.

#### Text size (2, single-tier)

| Token      | Value      | Replaces  | Regression         |
| ---------- | ---------- | --------- | ------------------ |
| `--text-s` | `0.75rem`  | `text-xs` | none — exact match |
| `--text-m` | `0.875rem` | `text-sm` | none — exact match |

No `--text-l`: nothing in the app uses a font size larger than `text-sm`
today.

#### Other tokens (3, single-tier)

| Token                | Value                     | Replaces                                                             | Regression                                                        |
| -------------------- | ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `--font-weight-bold` | `600`                     | `font-semibold` (`TabStrip`, `ListPanel` headers)                    | none                                                              |
| `--font-mono`        | `ui-monospace, monospace` | `font-mono` (`LayerPreviews` layer index readout, hidden debug text) | none                                                              |
| `--radius`           | `0.25rem`                 | `rounded`, `rounded-t`, `rounded-md`                                 | `rounded-md` site (`PhraseChip`) gets slightly less rounded, tiny |

`LayerPreviews`' video tiles use the same `1px` default border as everything
else — the current `border-2` is not preserved as a special case, so no
border-width token or hardcode is needed there either.

#### Not tokenized — hardcoded per-component

| Current usage | Call sites                    | Proposed handling      |
| ------------- | ----------------------------- | ---------------------- |
| `z-10`        | `TextField` clear button only | hardcode `z-index: 10` |

### Component scoping

CSS Modules, colocated with the component: `SceneSelector.tsx` gets
`SceneSelector.module.css` beside it, imported as
`import styles from './SceneSelector.module.css'` and applied via
`class={styles.card}`. Vite hashes the class names at build time — no
dependency, no config beyond what Vite already does.

Class names inside modules are camelCase (`.pickerRow`, not `.picker-row`) so
they read naturally as JS property access (`styles.pickerRow`).

### File layout

```
apps/vj-gui/src/
  styles/
    tokens.css       (@layer tokens)
    reset.css        (@layer reset)
    base.css         (@layer base)
    utilities.css     (@layer utilities)
  index.css           (the @layer statement + imports of the four files above)
  App.tsx / App.module.css
  catalog/SceneSelector.tsx / SceneSelector.module.css
  catalog/EffectSelector.tsx / EffectSelector.module.css
  catalog/PickerToolbar.tsx / PickerToolbar.module.css
  wordbank/*.tsx / *.module.css   (one per component)
  playback/LayerPreviews.tsx / LayerPreviews.module.css
  ui/RadioButton.tsx / RadioButton.module.css
```

## Rollout Plan

Single effort, in this order (each step verifiable before the next):

1. **Scaffold**: create `styles/tokens.css`, `reset.css`, `base.css`,
   `utilities.css`, wire the `@layer` statement into `index.css`. Tailwind
   still installed and imported — app should look unchanged.
2. **Convert leaf components first** (`RadioButton`, `PhraseChip`,
   `TextField`) — smallest surface, easiest to verify visually, and other
   components compose them so getting their tokens right early pays off.
3. **Convert container components** (`SceneSelector`, `EffectSelector`,
   `PickerToolbar`, `TabStrip`, `ListPanel`, `RecentPanel`, `TextSelector`,
   `LayerPreviews`, `App`).
4. **Remove Tailwind**: delete `@import 'tailwindcss'`, uninstall
   `tailwindcss` and `@tailwindcss/vite`, remove the plugin from
   `vite.config.ts`.
5. **Final visual pass**: run the app, exercise every screen (scene picker,
   effect picker, wordbank tabs/list/recent panels, layer preview grid,
   drag-and-drop reordering, disabled/hover/active states) side by side with
   a pre-migration screenshot set.

## Verification

- `pnpm typecheck` and `pnpm test` after each component conversion (per root
  `CLAUDE.md`).
- Visual check in a real browser per the skill for running this app — this is
  a UI change, so it's not done until it's been seen working, not just
  compiled.
- Confirm no `@layer`-ordering regressions: a utility override (`.u-hidden`)
  must still beat a component class even though `components` comes first in
  the declaration.
- Grep for `class="` strings containing Tailwind-shaped tokens (`neutral-`,
  `text-`, `bg-`, etc.) after step 4 — zero expected.

## Non-Goals

- **`apps/example`** is untouched by this effort.
- **Light/dark theming**: the semantic tier makes it possible later, but no
  second theme is being built now — vj-gui is a fixed-dark live-show tool.
- **Motion tokens** (duration/easing): nothing in the current app uses
  transitions; adding a token category for them now would be inventing
  scale from nothing. Add when a real transition is added.
- **A general-purpose reset/normalize library**: the reset is scoped to this
  app's actual elements, not a drop-in replacement for Tailwind Preflight's
  full breadth.

## Open Risks

- **Drag-and-drop and hover states** (`PhraseChip`, `ListPanel` reordering)
  rely on Tailwind's `group`/`group-hover` and `active:` variants in a few
  spots — these need explicit `:hover`/`:active`/parent-child selectors in
  the converted CSS Modules; easy to drop silently during conversion, so
  call them out specifically in step 2/3 review.
- **Merged/collapsed tokens will produce small visual regressions by
  design** (see Token Taxonomy) — acceptable per your direction, but worth a
  final visual pass rather than assuming they're unnoticeable.
