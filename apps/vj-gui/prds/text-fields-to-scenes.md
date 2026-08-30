# Wire text fields directly into the Scenes

Follow-up to the "edit mode" branch. Moves text off the GUI project: the web
pushes each scene loader its own finished lines over a call, and owns all text
state (Defaults **and** per-Layer overrides) in the wordbank.

## Decisions (from the interview)

- **Transport:** a per-scene call `setTextList({ lines: string[] })`, sibling to
  `loadScene` / `clearScene` in `td/scene-config.py`. Awaited, returns `{ ok }`.
- **Web resolves.** Each scene gets its own finished `string[]` (positional, no
  names, wire-escaped). The scene never hears the word "override".
- **Persistence:** the web is sole source of truth. Per-Layer overrides are
  persisted in the wordbank next to Defaults (`/api/wordbank` + SQLite). TD's
  DAT is a dumb cache of the last push, never read back.
- **Reload survival:** web reads the wordbank from SQLite and re-pushes every
  connected scene; a scene reconnecting (`status → synced`) auto-re-pushes.
- **`clearScene`:** web drops that Layer's overrides → resolution falls back to
  the Defaults → push. The TD `clearScene` handler stops touching text.
- **Minimum 2 text fields** stays (rename `WIRED_FIELDS` → `MIN_TEXT_FIELDS`).
- **No `td-core` protocol change.** `setTextList` is app config like `loadScene`.
- **No re-push after `loadScene`** — the DAT lives in the loader shell (`Inputs`),
  stable across tox swaps.

## What deletes

`src/wordbank/fieldSync.ts` + test, `src/wordbank/fieldBinding.ts`,
`src/wordbank/textOverride.ts` + test. The wired/unwired split, `tdFieldBinding`,
`createUnwiredFieldValues`, `synced()` gating, and the position-shift
reconciliation all go — overrides key by field id, so a delete needs no
slot repair.

---

## Phase 1 — domain

**`domain/wordbank/wordbank.ts`**

- Add `Overrides = Record<string, Record<string, string>>` — `layerId → fieldId →
value`. Stays stringly; the domain tier must not import the `LayerId` union.
- `Wordbank` gains `overrides: Overrides`.
- `WIRED_FIELDS` → `MIN_TEXT_FIELDS` (value unchanged, 2). Update the doc comment
  ("fewest a wordbank may hold").
- `defaultWordbank()` → `overrides: {}`.
- `isWordbank()` — validate `overrides` is an object whose values are objects of
  strings (`isOverrides` helper).
- Add pure `resolveLayerText(fields, overrides, layer): string[]` —
  `fields.map(f => overrides[layer]?.[f.id] || f.defaultValue)`. Raw strings;
  escaping happens at the push boundary.

**Tests:** `resolveLayerText` (override wins, blank override falls through to
Default, unknown layer → all Defaults, empty Default → `''`). `isWordbank`
accepts `overrides: {}` and a populated map, rejects a non-string leaf.

## Phase 2 — server / SQLite

**`server/wordbank/wordbank-db.ts`**

- `SCHEMA_VERSION` 3 → 4.
- Migration: `CREATE TABLE IF NOT EXISTS overrides ( layer TEXT NOT NULL,
field_id TEXT NOT NULL REFERENCES text_fields(id) ON DELETE CASCADE, value TEXT
NOT NULL, PRIMARY KEY (layer, field_id) )`. No seed — empty is valid. A v3 DB
  just gains the table.
- `readWordbank()` — read `overrides` into the nested record, `ORDER BY layer,
field_id`. Always emit the key (`{}` when empty).
- `writeWordbank()` — `DELETE FROM overrides` first in the transaction (before
  `text_fields`); insert `text_fields` before `overrides` (FK order). **Skip any
  override whose `field_id` isn't in `wordbank.fields`** — defensive against a
  stale client payload rolling back the whole write.

**Tests (`wordbank-db.test.ts`):** overrides round-trip; migration v3→v4 adds the
table and preserves existing content; deleting a field cascades its overrides;
an override for an unknown field id is dropped, not fatal.

**`server/wordbank/wordbank-api-plugin.test.ts`** — PUT/GET carry `overrides`;
a payload missing `overrides` is rejected by shape validation (unreleased, strict
is fine).

## Phase 3 — store

**`src/wordbank/store.ts`**

- `WordbankState` gains `overrides: Overrides`; hydrate from `wordbank.overrides`.
- `writeWordbank()` payload includes `unwrap(state.overrides)`.
- New `setOverride(layer, fieldId, value)` — `value.trim()` empty ⇒ delete the
  entry (and prune an emptied layer record); else set. `markWordbankDirty()`.
- New `clearLayerOverrides(layer)` — delete `overrides[layer]`. `markWordbankDirty()`.
- `deleteField(id)` — after removing the field, also delete `overrides[*][id]`
  across every layer (in-memory prune; the DB write is a full rewrite).
- `deleteField` guard: `<= MIN_TEXT_FIELDS`.
- Drop the `WIRED_FIELDS` import; use `MIN_TEXT_FIELDS`.

**Tests (`store.test.ts`):** `setOverride` sets / empties / prunes; `clearLayerOverrides`;
override survives deletion of a _different_ field; deleting a field drops its
overrides on every layer; `deleteField` still refused at 2.

**`src/wordbank/wordbank-api.ts`** — no code change; `isWordbank` covers `overrides`.

## Phase 4 — transport & push

**`src/playback/wire.ts`**

- `LoaderCalls` gains
  `setTextList: { args: { lines: string[] }; result: { ok: boolean } }`.
- Remove `LayerTextParamName`, `layerTextParam()`, and the
  `Record<LayerTextParamName, string> &` from `GuiParams` — `GuiParams` becomes
  `{ activeColorScheme; beatPeriod }`. Update the `GuiParams` / `GuiClient` doc
  comments (they still say "a text1/text2 pair per scene loader").

**`src/playback/clients.tsx`** — drop `export type { LayerTextParamName }`; fix
the `GuiClient` comment ("the twelve loaders' text params").

**`src/wordbank/textPush.ts`** (new — replaces `fieldSync.ts`)

```ts
export function createTextPush(
  store: WordbankStore,
  connections: Accessor<LayerConnections>,
): void {
  for (const layer of layerIds) {
    createEffect(() => {
      const conn = connections()[layer];
      if (!conn || conn.status() !== 'synced') return;
      const lines = resolveLayerText(store.state.fields, store.state.overrides, layer).map(
        escapeNewlines,
      );
      void conn
        .call('setTextList', { lines })
        .catch((e) => console.warn('[vj-gui] setTextList failed', layer, e));
    });
  }
}
```

One effect per layer: a Default edit touches `store.state.fields` → all 12
re-push; an override edit touches `store.state.overrides[layer]` → only that
layer re-pushes (Solid store is fine-grained on the keyed access inside
`resolveLayerText`); a reconnect flips `status()` → re-push.

**`src/wordbank/TextPush.tsx`** (new — headless) — a null component that calls
`createTextPush(useWordbank(), usePlayback().connections)`. Rendered in `App`
inside both `<PlaybackProvider>` and `<WordbankProvider>`. (Reuses the
`registerConnection` registry that `loadOnLayer` already depends on; the registry
is populated by the always-mounted `LayerPreviews` tiles.)

**`src/App.tsx`** — render `<TextPush />` under `WordbankProvider`.

**Tests (`textPush.test.ts`):** against fake connections — pushes each layer its
resolved lines once synced; does not push while `connecting`; re-pushes on a
`connecting → synced` flip; an override on one layer pushes only that layer;
a Default edit pushes all 12; lines are wire-escaped.

## Phase 5 — UI rewrite

**`src/wordbank/TextField.tsx`**

- Props: `field`, `position`, `layer: LayerId`, `onFilter`, `onFocus`, `onBlur`
  (+ `useWordbank()` inside for `setOverride` / `commitRecent`).
- `committed()` → `store.state.overrides[props.layer]?.[props.field.id] ?? ''`.
- `write(text)` → `store.setOverride(props.layer, props.field.id, text.trim() ? text : '')`.
  No escaping here — the store holds raw strings.
- Drop `binding.readonly()` / `disabled`, `beginEdit` / `endEdit`, the
  `textOverride` / `wireDefault` imports. Clear button → `setOverride(..., '')`.
- Trim the file header per the comments rule while it's open.

**`src/wordbank/TextSelector.tsx`**

- Drop `wired` / `unwired` / `bindingFor` / `createFieldSync` / `tdFieldBinding` /
  `layerTextParam` / `GuiClient` usage.
- `<TextField field={field} position={i()+1} layer={selectedLayer()} … />`.
- `TextFieldEditor` → `onSetDefault={(v) => store.setFieldDefault(field.id, v)}`,
  `onDelete={() => store.deleteField(field.id)}`,
  `deletable={store.state.fields.length > MIN_TEXT_FIELDS}`.
- `applyPhrase(phrase)` → resolve the focused/pressed field id →
  `store.setOverride(selectedLayer(), fieldId, phrase)` + `store.commitRecent(phrase)`.

**`src/playback/LayerPreviews.tsx`**

- `layerText(layer, i)` → read from the store:
  `store.state.overrides[layer]?.[field.id]` per field, `.trim() || undefined`.
- `LayerTexts` — caption every field that has an override for this layer, in
  field order (was hard-coded to 2; now `store.state.fields.length` of them).
- `ClearLayer` — remove the `text1` / `text2` `GuiClient.signal`s, `default1/2`,
  and the `escapeNewlines` import; replace the two `setValue` calls with
  `store.clearLayerOverrides(props.layer)`. Keep the `clearScene` call and the
  layout/color writes. Trim the two comment blocks added on the last branch.
- Drop the `wiredFieldDefault` / `textOverride` imports.

## Phase 6 — TD config

**`td/scene-config.py`**

```python
# The DAT the scenes read via iop.Inputs.TextVars — lives in the loader shell,
# so a loadScene tox swap leaves it intact. CONFIRM this path.
TEXT_LIST = "/Scene1/Inputs/text_list"

def _set_text_list(args):
    lines = (args or {}).get("lines", [])
    if not isinstance(lines, list):
        raise ValueError("setTextList needs a lines array")
    dat = opex(TEXT_LIST)
    dat.clear()
    for line in lines:
        dat.appendRow([str(line)])
    return {"ok": True}

HANDLERS = {"loadScene": _load_scene, "clearScene": _clear_scene, "setTextList": _set_text_list}
```

Lines arrive wire-escaped (literal `\n`), exactly as the param path delivered
them — the scene-side read of `TextVars` is unchanged. **Untested in CI** — say
so. The `TEXT_LIST` path and any upstream DAT rewiring is the operator's to
confirm/build.

**`td/gui-config.py`**

- Delete the `for _scene in SCENE_IDS:` REGISTRY loop and `SCENE_IDS` /
  `SCENE_PATH` (now unused).
- Update the module docstring — drop "the twelve loaders' text params",
  "`/GUI/ExternalScenes/SceneA … SceneZ4 custom pars Text, Text2`". The proxy
  comps stay (other purposes); their `Text` / `Text2` pars are removed upstream
  by the operator.

## Phase 7 — docs & close-out

- `TODO.md` — check off the three "Things I will follow up with in TD" items;
  note `TEXT_LIST` path + upstream DAT wiring as the remaining TD-side task.
- `UBIQUITOUS_LANGUAGE.md` — the Relationships section still says the wire
  "carries exactly two text params per Layer"; update to "the web pushes each
  Layer's resolved lines as one list".
- `apps/vj-gui/CLAUDE.md` "The TouchDesigner side" — one line: text is a
  `setTextList` call to each scene loader, not a GUI param.

## Verification

- `pnpm --filter vj-gui typecheck` + `test` green.
- `pnpm --filter vj-gui build` (apps import `td-core` from `dist/`).
- Manual, with the rig: edit a Default → all connected layers follow; type an
  override on the selected layer → only it changes; Clear → back to Defaults;
  reload the browser → text unchanged; restart a scene process → it re-fills on
  reconnect.
- TD-side `setTextList` is untested by CI — state that in the PR.
