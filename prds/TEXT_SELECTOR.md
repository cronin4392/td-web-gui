# PRD: `apps/text-selector`

A Solid app for driving two TouchDesigner string parameters (Text 1, Text 2) from a curated,
persistent library of phrases. Built on `td-core` per [TECH_PROPOSAL.md](TECH_PROPOSAL.md).

Those two fields belong to whichever of the eight external scene loaders TD's `selectedLoader`
points at: each loader exposes its own `scene<A-H>Text1` / `scene<A-H>Text2` pair, and the app binds
the fields to the selected one (see `td.config.ts` and `td/config.py`). Everywhere below
that says "Text 1"/"Text 2" means the selected loader's pair.

## Problem

Today `apps/text-selector` is two bare `<TextInput>`s bound to `text1` / `text2`
([App.tsx](../apps/text-selector/src/App.tsx)). Every keystroke goes to TD, and every phrase must be
retyped. The operator's real workflow is _recall_, not composition: the same phrases get sent over
and over, in a live setting where a half-typed word must never reach the render.

## Goals

1. Text reaches TD only on an explicit commit — never mid-keystroke.
2. Recently used phrases are one click away.
3. Phrases are organised into named lists, editable in-app, persisting across reloads.

## Non-goals (v1)

- Syncing the phrase library to TD — the library never reaches the WebSocket wire (see
  [§5](#5-storage) for where it does live: a local SQLite file, not TD).
- Dragging phrases _between_ tabs (tabs are not drop targets for phrases).
- Multi-instance / video. This app talks to one TD instance and sends two strings.
- A keyboard equivalent for drag-reordering (see [Accessibility](#accessibility)).

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Text 1  [ ______________________________ ]          │  ← <form> each, commit on Enter
│  Text 2  [ ______________________________ ]          │
├──────────────────────────────────────────────────────┤
│  Recent                                               │  ← max 10, most-recent first
│  ⠿ intermission                                       │
│  ⠿ hello world                                        │
│  ⠿ cue two                                            │
├──────────────────────────────────────────────────────┤
│  [ Cues ][ Titles ][ Names ]                    [+]  │  ← tab strip, + adds a list
│  ┌────────────────────────────────────────────────┐  │
│  │ [ filter…                          ]  [A→Z] [+]│  │
│  │ ⠿ intermission                             [×] │  │
│  │ ⠿ hello world                              [×] │  │
│  │ ⠿ cue two                                  [×] │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

No emoji anywhere in the UI — icons are text/ASCII (`×`, `⠿`, `+`) or omitted.

---

## 1. Text inputs

Two inputs bound to `text1` and `text2`, each wrapped in its own native `<form>`.

- **Typing sends nothing.** Keystrokes update a local draft only.
- **Enter commits.** The browser's implicit form submission fires `submit`; the component
  `preventDefault()`s it and commits the draft — writing the bound signal and sending the TD
  `update`. Using a real `<form>` rather than a hand-rolled keydown handler is what gets IME,
  autofill, and platform Enter semantics for free.
- **Blur commits too.** Clicking away is treated as a commit, matching a native form field.
- **Escape reverts** the draft to the last committed value and sends nothing. A blur immediately
  after Escape does not re-commit (the draft is clean).
- **A commit whose draft equals the last committed value is a no-op** — no `update` on the wire, no
  recent-list entry. This is what keeps Enter-then-blur from firing twice.
- Empty-string commits are valid (clearing a TD text par is a real operation) but are **not** added
  to the recent list.
- **The fields are multi-line** (`<textarea>`, 3 rows). **Shift+Enter inserts a line break**; plain
  Enter still commits. Line breaks reach TD as the `\n` escape its string pars use, and TD's `\n`
  comes back as a real break in the field — the stored recent/phrase entries keep real newlines.

This requires a change to `td-core`'s `<TextInput>` — see [§6](#6-td-core-changes).

## 2. Recent phrases

A single deduped list of the **last 10 committed phrases across both inputs**, most recent first.

- Any commit feeds it, whatever the source: typing + Enter, blur, a phrase-button click, or a drop.
- Committing a phrase already in the list **moves it to the top** rather than duplicating it.
  Matching is exact on the trimmed string (case-sensitive — `HELLO` and `hello` are different cues).
- Overflow past 10 drops from the tail.
- Empty commits are ignored.
- Each entry is a phrase button with the **same affordances, and the same row styling, as a
  phrase-list button** (§3's "Phrase row" — full-width row, not a compact pill): click → commits to
  Text 1; drag → drop on either input to commit there. It has no delete or reorder handle — the list
  is derived history, not an editable collection.

## 3. Phrase lists (tabs)

### Tab strip

- Tabs run left to right with a **`+`** button at the right end. `+` appends a new tab with an empty
  list, auto-named `List N` (lowest N not already taken), and activates it.
- **Rename** — double-click a tab label to edit inline. Enter commits, Escape cancels, blur commits.
  An empty name reverts to the previous one.
- **Delete** — an `×` on the tab, behind a confirm, since it discards a whole stored list. Deleting
  the active tab activates its left neighbour (or the right one if it was first). **Delete is
  disabled when only one tab remains** — the app always has at least one list.
- **Reorder** — tabs are drag-reorderable within the strip. This is a separate drag surface from
  phrase reordering; a phrase dragged over the tab strip is not a valid drop.
- The active tab persists across reloads.

### List body

**Search** — a filter input at the top of the list. Case-insensitive substring match against the
current tab's phrases; it never leaves the tab. Clearing it restores the full list. While a filter
is active, **drag-reorder is disabled** (a drop index against a filtered view is ambiguous); add and
delete still work.

**Add** — a `+` button reveals an inline `<form>` above the list. Enter (native submission) adds the
phrase to the **top** of the current tab's list and clears the field, leaving the form open so
several phrases can be entered in a row. Escape closes it, and so does **clicking `+` again while
the form is open** — it's a toggle, not a one-way reveal. Rules:

- The phrase is trimmed; empty input is ignored.
- Adding a phrase already in this tab **moves the existing entry to the top** — no duplicates within
  a list. (The same phrase may appear in several tabs; that's intended.)

**Phrase row** — a full-width draggable button showing the phrase, with an `×` delete pinned to the
row's **trailing (right) edge**.

- **Click → commits to Text 1** immediately: sets the input _and_ sends the TD `update` in one
  action, and pushes onto the recent list. Phrase buttons are one-click triggers, not fillers.
- **Drag → drop on Text 1 or Text 2** commits to _that_ input, same as a click.
- **`×` deletes** the phrase from this tab. No confirm — a single phrase is cheap to retype, and a
  confirm on every row would be noise.
- **Drag-reorder** within the list, with a drop-indicator line at the insertion point.

**A→Z button** — sorts the current tab's phrases alphabetically **once**, and persists that as the
new manual order. It is not a sticky mode: drag-reorder works immediately afterwards, and newly
added phrases still land at the top. One order per list, always. Sort is case-insensitive
(`localeCompare` with `sensitivity: 'base'`).

## 4. Drag and drop

**Native HTML5 DnD** — no dependency. The target platform is desktop Firefox and Chrome only
([TECH_PROPOSAL.md:59](TECH_PROPOSAL.md)), so the absence of touch support costs nothing.

Every drag sets two payloads:

```ts
dataTransfer.setData('text/plain', phrase); // interop / debuggability
dataTransfer.setData(
  'application/x-td-phrase',
  JSON.stringify({
    phrase,
    source: 'list' | 'recent',
    tabId, // null for recent
    index, // null for recent
  }),
);
```

Two drop targets, both keyed on the **custom mime**, not `text/plain`:

| Target                  | Behaviour                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A text input            | `preventDefault()` on `dragover`/`drop` (suppressing the browser's default text-insert) → commit the phrase to that input. |
| A phrase row / list gap | Reorder within the source tab. A drop whose `tabId` isn't the active tab is rejected (no cross-tab moves in v1).           |

Requiring `application/x-td-phrase` means text dragged in from outside the app (a browser selection,
another window) is simply not accepted — an external drop can't silently fire a TD update.

Reorder index is computed from the pointer's position against each row's vertical midpoint
(above → insert before, below → insert after).

## 5. Storage

Storage is split by what the data _is_, not kept in one blob:

| Data                              | Home                                           | Why                                                                                 |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tabs` (id, name, phrases, order) | SQLite                                         | curated library content — inspectable, backup-able, survives a browser profile wipe |
| `recent`                          | SQLite                                         | committed phrase content, just auto-collected rather than hand-curated              |
| `activeTabId`                     | `localStorage` (`td-web-gui:text-selector:ui`) | a per-browser UI preference, not library content                                    |

### Library — SQLite via `/api/library`

`apps/text-selector` runs a small persistence API alongside its Vite dev/preview server (a Vite
plugin, `server/library-api-plugin.ts`) backed by a SQLite file at `apps/text-selector/data/text-selector.db`
(gitignored; path overridable via `TEXT_SELECTOR_DB`). The browser never touches SQLite directly —
it only ever calls `GET`/`PUT /api/library`.

```sql
CREATE TABLE tabs (
  id       TEXT PRIMARY KEY,     -- crypto.randomUUID(), never derived from the name
  name     TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE phrases (
  tab_id   TEXT NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  phrase   TEXT NOT NULL,        -- real newlines; the `\n` escape is a wire concern, not storage
  position INTEGER NOT NULL,
  PRIMARY KEY (tab_id, phrase)   -- backstop for §3's no-duplicates-within-a-list rule
);
CREATE TABLE recent (
  phrase   TEXT PRIMARY KEY,
  position INTEGER NOT NULL      -- 0 = most recent; the ≤10 cap is still enforced in the store
);
```

- **`PRAGMA user_version` is the migration hook**, replacing the old JSON document's `version`
  field. On first open (`user_version = 0`) the schema is created and seeded with a single empty
  `List 1` tab, so "there is always at least one list" (§3's last-tab guard) is a database
  invariant rather than something every reader re-derives.
- **A malformed `GET /api/library` response falls back to defaults** — bad JSON, a non-object, or a
  failed shape validation is logged and the app starts with a single empty `List 1` tab and no
  recent history. Never throws; a bad or unreachable server must not white-screen the app.
- **Writes are debounced** (~200ms) and `PUT` the whole library. The server applies it as a
  transactional delete-and-reinsert across the three tables. Same tradeoff as before: at tens of
  phrases the rewrite is instant, and it keeps every store mutator free of per-mutation SQL — the
  cost is no per-row identity or write history, which nothing here needs.
- **A failed `PUT` is non-fatal** — logged once; the app continues working in-memory for the
  session (its next successful write catches the database back up).
- **Known limitation:** two browser tabs open on the app each hold their own in-memory store, so the
  last debounced write wins. Unchanged from the localStorage version, just worth restating now that
  "last write wins" means _across_ tabs/windows, not just within one.

### UI state — `localStorage`

`activeTabId` alone lives under `td-web-gui:text-selector:ui` in `localStorage`, written on the same
debounce as the library write but independently: switching tabs updates `localStorage` without
triggering a library `PUT`. A stored id that names no loaded tab (stale after a tab was deleted
elsewhere) falls back to the first tab.

State lives in a single Solid store owned by the app (`src/store.ts`), with the library and UI
persistence layers as independent subscribers sharing one debounce timer. **No phrase-library state
ever reaches TD** — the only thing on the WebSocket wire is the two committed strings.

## 6. `td-core` changes

`<TextInput>` currently sends on every keystroke ([TextInput.tsx:30](../packages/td-core/src/components/TextInput.tsx)).
It gains a commit mode, and this app is the first consumer.

```ts
export interface TextInputProps {
  name: string;
  /** When the local value is written to the bound signal and sent to TD. Default: 'input'. */
  commitOn?: 'input' | 'enter';
  /** Render a `<textarea>`, carrying line breaks to TD as the `\n` escape. */
  multiline?: boolean;
  /** Visible rows; `multiline` only. */
  rows?: number;
  /** Fired on each committed value (including via form submit / blur), with real newlines. */
  onCommit?: (value: string) => void;
}
```

- **`commitOn="input"` is the default**, so `apps/example` and the existing tests are unchanged.
- **`commitOn="enter"`** holds a local draft signal. Keystrokes touch only the draft. The component
  looks up `el.form` and, when present, listens for its `submit` event (preventDefault → commit);
  with no ancestor form it falls back to an Enter `keydown` handler guarded on `event.isComposing`
  so an IME confirmation doesn't commit.
- Blur commits; Escape reverts the draft and marks it clean; a commit equal to the last committed
  value is skipped.
- The existing focus-based echo suppression ([TECH_PROPOSAL.md:215](TECH_PROPOSAL.md)) is unchanged
  and is what makes the draft safe: inbound TD updates are ignored while focused, and because blur
  always flushes, **a draft can only exist while the input is focused** — there is no unfocused
  pending state for an inbound update to fight with.
- The app also needs to set an input's value programmatically (phrase click / drop). That's the
  existing `signal()` write path — a phrase apply is an ordinary commit, not a draft edit. Because
  that path bypasses the component, it owes the same newline escaping (`escapeNewlines`, exported
  from `td-core`) that a multi-line commit does.
- **`multiline`** renders a `<textarea>` and translates newlines ↔ TD's `\n` escape at the wire
  boundary; Enter commits, Shift+Enter breaks the line. See
  [TECH_PROPOSAL.md § Multi-line text](TECH_PROPOSAL.md#multi-line-text) for why the translation is
  per-component rather than applied to every string param.

`TECH_PROPOSAL.md` gets a short _Text commit modes_ entry under **Behavioral Decisions** recording
the default and the blur/Escape rules, and `TASKS.md` gains the corresponding task.

## Accessibility

- Every drag action has a non-drag equivalent **except reordering**: click applies a phrase to
  Text 1, and A→Z is a button. Reordering is mouse-only in v1 — an accepted gap, noted here rather
  than discovered later.
- Phrase rows, tabs, delete and add controls are real `<button>`s; the tab strip carries
  `role="tablist"` / `aria-selected` and supports arrow-key navigation between tabs.
- Confirm steps (tab delete) are keyboard-reachable.

## Testing

Vitest, against the store module — it holds all the logic worth testing and needs no DOM:

- recent list: dedupe-to-top, 10-item cap, empty-commit rejection, both inputs feeding one list
- tabs: add / rename / delete (including the last-tab guard and active-tab reassignment), reorder
- phrases: add-to-top, dedupe-to-top within a tab, delete, reorder index maths, one-shot A→Z
- filter: case-insensitive substring, reorder disabled while filtered
- persistence (`src/store.test.ts`): library round-trip, debounce coalescing, save-failure is
  non-fatal, `activeTabId` round-trips through `localStorage` independent of the library, an
  active-tab change alone doesn't trigger a library write
- `/api/library` client (`src/library-api.test.ts`): malformed-response / network-failure fallback
  to defaults, failed `PUT` rejects
- SQLite layer (`server/text-db.test.ts`): schema + seed on a fresh file, migration is idempotent,
  round-trip preserves ordering, a rewrite fully replaces prior contents, `ON DELETE CASCADE`,
  duplicate-phrase rejection, a failed write rolls back rather than half-applying

In `td-core`: `commitOn="enter"` — nothing sent while typing, commit on submit, commit on blur,
Escape reverts silently, no-op on unchanged value, `commitOn="input"` behaviour unregressed.

## Tasks

- [x] **T1 — `td-core` `commitOn`.** `commitOn` + `onCommit` props, form-submit and fallback keydown
      paths, blur/Escape/no-op rules, tests. Update `TECH_PROPOSAL.md` + `TASKS.md`.
- [x] **T2 — Store + persistence.** `StoredState` shape, Solid store, all mutations, debounced
      localStorage subscriber with validating loader. Full Vitest coverage.
- [x] **T3 — Text inputs.** Two `<form>`-wrapped `commitOn="enter"` inputs; `onCommit` feeds recent.
- [x] **T4 — Recent row.** Renders from the store; click commits to Text 1.
- [x] **T5 — Tab strip.** Render, activate, `+` add, inline rename, delete + confirm + last-tab
      guard.
- [x] **T6 — Phrase list.** Rows, click-to-commit, `×` delete, add form, A→Z.
- [x] **T7 — Search filter.** Filtered view + reorder disabled while filtered.
- [x] **T8 — DnD.** Custom-mime payload; phrase → input drops; phrase reorder with drop indicator;
      tab reorder.
- [x] **T9 — Accessibility pass.** Tablist roles, arrow-key tab nav, focus management on
      add/rename/delete.
- [x] **T10 — SQLite persistence.** `server/text-db.ts` (schema, `PRAGMA user_version` migration + seed,
      `readLibrary`/`writeLibrary`) and `server/library-api-plugin.ts` (`GET`/`PUT /api/library` on both the dev
      and preview servers) using `node:sqlite`. `src/library.ts` shared types/guards,
      `src/library-api.ts` client. `store.ts` reworked to split library writes (SQLite) from
      `activeTabId` (`localStorage`) on one shared debounce. Full test coverage across all three
      layers; see [Testing](#testing).
