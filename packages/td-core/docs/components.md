# Components

Every component binds one TouchDesigner parameter by `name` and is a member of
the bundle `createTDClient<Schema>()` returns, so `name` is checked against your
schema:

```tsx
const App = createTDClient<Params>()

<App.Provider url="ws://localhost:9980">
  <App.RangeInput name="intensity" min={0} max={1} step={0.01} />
</App.Provider>
```

They are also exported unbound (`import { RangeInput } from 'td-core'`) for cases
where you don't want the schema typing. Both forms are the same component and
bind through the same context.

- [Shared behavior](#shared-behavior)
- [Which component for which parameter](#which-component-for-which-parameter)
- [`<TextInput>`](#textinput) · [`<NumberInput>`](#numberinput) ·
  [`<RangeInput>`](#rangeinput) · [`<Toggle>`](#toggle) ·
  [`<Button>`](#button) · [`<Select>`](#select) ·
  [`<Vector>`](#vector) · [`<Color>`](#color) ·
  [`<Value>`](#value) · [`<Table>`](#table) · [`<Video>`](#video) ·
  [`<StreamToggle>`](#streamtoggle)
- [Styling](#styling)

## Shared behavior

Four rules hold for every bound control, so they aren't repeated per component.

**Writes are optimistic.** A control updates its own signal the moment you type
or drag, before TD acknowledges anything. The UI never waits a round trip.

**The local edit wins while you're editing.** While a control is focused (or a
slider is mid-drag), inbound values for that parameter are ignored, so the value
and cursor never jump out from under you. Sync resumes on blur. Several controls
can bind the same name — the suppression is a count of active editors, not a
flag.

**Read-only parameters disable themselves.** A control bound to a name in the
provider's `readonly` list renders `disabled` and warns in the console. So does
one TD refuses at runtime with `param_not_writable`. An explicit `disabled` prop
always wins over both.

**Unknown props pass through.** Everything not listed below is spread onto the
underlying element, so `class`, `id`, `aria-*`, `style`, `placeholder`, and the
rest work normally. Event handlers you pass are called _in addition_ to the
component's own — yours never replaces the binding logic.

## Which component for which parameter

| TouchDesigner parameter | Wire type  | Component                                                      |
| ----------------------- | ---------- | -------------------------------------------------------------- |
| String                  | `string`   | [`<TextInput>`](#textinput)                                    |
| Float / Int             | `number`   | [`<NumberInput>`](#numberinput), [`<RangeInput>`](#rangeinput) |
| Toggle                  | `bool`     | [`<Toggle>`](#toggle), [`<Button mode="toggle">`](#button)     |
| Pulse                   | —          | [`<Button mode="pulse">`](#button)                             |
| Menu                    | `string`   | [`<Select>`](#select)                                          |
| XYZ / UV / WH ParGroup  | `number[]` | [`<Vector>`](#vector)                                          |
| RGB / RGBA ParGroup     | `number[]` | [`<Color>`](#color)                                            |
| any (read-only)         | any        | [`<Value>`](#value)                                            |
| Video Stream Out TOP    | —          | [`<Video>`](#video), [`<StreamToggle>`](#streamtoggle)         |

A [readout](touchdesigner-setup.md#readouts) — a `READOUTS` entry with no
parameter behind it — binds by name like anything else, so the same components
apply:

| Readout source    | Wire type    | Component                                  |
| ----------------- | ------------ | ------------------------------------------ |
| One CHOP channel  | `number`     | [`<Value>`](#value)                        |
| Several channels  | `number[]`   | [`<Value>`](#value), [`<Vector>`](#vector) |
| One DAT cell      | `string`     | [`<Value>`](#value)                        |
| A whole DAT table | `string[][]` | [`<Table>`](#table)                        |

Readouts are TD → web only, so prefer a read-only component. An editable one
bound to a readout renders disabled once TD refuses the first write — declaring
the name in the provider's `readonly` list disables it from the start instead.

---

## `<TextInput>`

Renders `<input type="text">`, or `<textarea>` with `multiline`. Binds a
`string` parameter.

| Prop        | Type                      | Default   | Description                                        |
| ----------- | ------------------------- | --------- | -------------------------------------------------- |
| `name`      | `string`                  | —         | Parameter to bind.                                 |
| `commitOn`  | `'input' \| 'enter'`      | `'input'` | When the value reaches the wire.                   |
| `multiline` | `boolean`                 | `false`   | Render a `<textarea>` and translate line breaks.   |
| `rows`      | `number`                  | —         | Visible rows. `multiline` only.                    |
| `onCommit`  | `(value: string) => void` | —         | Fired on each committed value, with real newlines. |

**`commitOn="input"`** sends on every keystroke. Right for a live text overlay.

**`commitOn="enter"`** holds keystrokes in a local draft and sends nothing until
commit. Right for a field where a half-typed value would be wrong to show.
Commit happens on the ancestor `<form>`'s submit, on Enter when there is no form,
and always on blur. **Escape reverts** the draft and sends nothing. A commit
equal to the last committed value is a no-op, so blurring after Escape can't
re-send.

```tsx
<App.TextInput name="title" commitOn="enter" onCommit={(v) => console.log(v)} />
```

### Multi-line and the `\n` escape

TouchDesigner string parameters carry line breaks as the two-character escape
`\n`, not as real newlines — a Text TOP renders `\n` as a break. `multiline`
translates at the wire boundary: the textarea holds real newlines, TD holds the
escape. Under `commitOn="enter"`, **Enter commits and Shift+Enter inserts a
break**.

This is opt-in per component rather than applied to every string parameter,
because `\n` in a parameter holding a Windows path is a path, not a line break.
If you write such a parameter through `signal()` directly, the
[`escapeNewlines` / `unescapeNewlines`](api.md#wire-helpers) helpers are exported.

`multiline` and `commitOn` are read once at setup. Remount to change them.

---

## `<NumberInput>`

Renders `<input type="number">`. Binds a `number` parameter.

| Prop          | Type               | Description             |
| ------------- | ------------------ | ----------------------- |
| `name`        | `string`           | Parameter to bind.      |
| `min` / `max` | `number`           | Clamped before sending. |
| `step`        | `number \| string` | Passed to the input.    |

Never sends `NaN`. While the field is empty or unparseable it holds the last
valid value and sends nothing, so TD keeps showing the last good number. On blur
an empty or invalid field snaps back to the current value, so the display and TD
can't drift apart.

The visible text is left uncontrolled while you type, so clamping affects the
value sent but never fights your cursor.

---

## `<RangeInput>`

Renders `<input type="range">`. Binds a `number` parameter.

| Prop                   | Type               | Default | Description                                |
| ---------------------- | ------------------ | ------- | ------------------------------------------ |
| `name`                 | `string`           | —       | Parameter to bind.                         |
| `min` / `max` / `step` | `number \| string` | —       | Passed to the input.                       |
| `throttle`             | `boolean`          | `true`  | Coalesce sends to one per animation frame. |

Sliders are high-frequency, so wire sends are **throttled by default**: the
optimistic local write is still immediate (the thumb and any bound `<Value>`
readout move without waiting), but `update` messages coalesce to one per frame.
Pass `throttle={false}` for a low-frequency use where every intermediate value
matters.

A slider's value is always a valid in-range number, so unlike `<NumberInput>`
there's no empty/`NaN`/clamp handling to think about.

---

## `<Toggle>`

Renders `<input type="checkbox">`. Binds a `bool` parameter. Takes only `name`
plus passthrough props.

---

## `<Button>`

Renders `<button type="button">`. One component, three distinct wire behaviors.

| Prop   | Type                            | Default   | Description                                           |
| ------ | ------------------------------- | --------- | ----------------------------------------------------- |
| `name` | `string`                        | —         | Parameter to bind.                                    |
| `mode` | `'pulse' \| 'hold' \| 'toggle'` | `'pulse'` | Wire behavior. Read once at setup; remount to change. |

```tsx
<App.Button name="reset" mode="pulse">Reset</App.Button>
<App.Button name="gate"  mode="hold">Gate</App.Button>
<App.Button name="mute"  mode="toggle">Mute</App.Button>
```

**`mode="pulse"`** fires a TouchDesigner **Pulse** parameter. A pulse is an
event, not a value: each click sends a dedicated `pulse` message, the component
holds no synced state, and it is web → TD only. Never throttled — one pulse per
activation.

**`mode="hold"`** is a momentary bool: `true` on press, `false` on release. An
ordinary bidirectional `update`, so it reflects TD-side changes and resyncs like
any other control. Two details keep the bool from getting stranded `true`:

- **Pointer capture** on `pointerdown`, so `pointerup` still arrives after the
  cursor drags off the button. `pointercancel`, `lostpointercapture`, and a
  window `blur` while held all release too — the "OS stole focus mid-press" cases
  a bare `pointerleave` misses.
- **Keyboard.** Space/Enter keydown presses, keyup releases, with key-repeat
  suppressed so holding the key doesn't re-fire.

Both `hold` and `toggle` carry `aria-pressed`.

**`mode="toggle"`** is the same wire path as `<Toggle>`, rendered as a button —
the "TD has a Toggle, I want it to look like a button" case.

Only `pulse` bypasses the signal layer, so only `hold` and `toggle` disable on a
read-only parameter. A pulse has no synced value to protect.

---

## `<Select>`

Renders `<select>`. Binds a `string` parameter backed by a TD **Menu**. The wire
value is the menu's string **key**, which survives TD-side menu reordering where
an index wouldn't.

| Prop      | Type                 | Description                                            |
| --------- | -------------------- | ------------------------------------------------------ |
| `name`    | `string`             | Parameter to bind.                                     |
| `options` | `{ value, label }[]` | Web-authored options. Omit to use TD's announced menu. |

**With `options`** — the default. You author the list; keeping it in sync with
TD's menu is your job, exactly like the typed schema itself.

```tsx
<App.Select
  name="blendmode"
  options={[
    { value: 'over', label: 'Over' },
    { value: 'add', label: 'Add' },
  ]}
/>
```

**Without `options`** — the dropdown builds itself from the menu TD announces.
This exists for menus that genuinely _cannot_ be authored ahead of time. An
Audio Device In CHOP's `device` menu is the motivating case: the keys are
machine-specific GUIDs and the list changes when hardware is plugged in.

```tsx
<App.Select name="audiodevice" />
<button onClick={() => conn.requestMenus()}>Reload devices</button>
```

The prop always wins when both exist, so adding announcements to a TD project
can never change what an existing `<Select>` renders.

**Refreshing.** Menu _contents_ changing raises no TouchDesigner event, so
something has to look again — hence the reload button calling
[`requestMenus()`](api.md#connection). See
[design-notes.md § TD-announced menus](design-notes.md#td-announced-menus) for
the full story, including a route that looks like it should work and doesn't.

**A value with no matching option** — a device unplugged while selected, or
web-authored options that have drifted — renders as a disabled
`"<key> (unavailable)"` entry rather than being dropped. A `<select>` asked to
hold a value it doesn't have displays some _other_ option instead, which would
misreport TD's state as though the user had chosen it.

---

## `<Vector>`

Renders a `<div>` of numeric inputs. Binds a multi-component `number[]` ParGroup
— XYZ position, UV, size. The generic case of the array wire shape.

| Prop                   | Type               | Default         | Description                                      |
| ---------------------- | ------------------ | --------------- | ------------------------------------------------ |
| `name`                 | `string`           | —               | Parameter to bind.                               |
| `length`               | `number`           | `3`             | Component count. Ignored if `labels` is given.   |
| `labels`               | `string[]`         | `['0', '1', …]` | Per-component labels; its length sets the count. |
| `min` / `max` / `step` | `number \| string` | —               | Applied to every sub-input.                      |
| `throttle`             | `boolean`          | `true`          | Coalesce sends to one per animation frame.       |
| `disabled`             | `boolean`          | read-only state | Disable every component input.                   |

```tsx
<App.Vector name="position" labels={['x', 'y', 'z']} step={0.01} />
```

Each sub-input follows the same invalid/empty rules as `<NumberInput>`, but
writes back the **whole** array as one `update` — the wire shape has no notion of
one component in isolation. Editing any sub-input suppresses TD echoes for every
component until it blurs.

---

## `<Color>`

Renders a native `<input type="color">`, plus a 0–1 range slider when `alpha` is
set (the color input has no native alpha channel). Binds a `[r,g,b]` or
`[r,g,b,a]` array of 0–1 floats, matching TD's color pars.

| Prop       | Type      | Default         | Description                                              |
| ---------- | --------- | --------------- | -------------------------------------------------------- |
| `name`     | `string`  | —               | Parameter to bind.                                       |
| `alpha`    | `boolean` | `false`         | Render a fourth channel; wire array becomes `[r,g,b,a]`. |
| `throttle` | `boolean` | `true`          | Coalesce sends to one per animation frame.               |
| `disabled` | `boolean` | read-only state | Disable both inputs.                                     |

The native color input is 8-bit per channel, so values round-trip through hex.
For higher precision use `<Vector name="color" length={4} min={0} max={1} />`.

---

## `<Value>`

Renders a `<span>`. Read-only readout of any parameter — subscribes to inbound
updates, never sends, never participates in focus/echo logic.

| Prop     | Type                            | Description                                |
| -------- | ------------------------------- | ------------------------------------------ |
| `name`   | `string`                        | Parameter to read.                         |
| `format` | `(value: ParamValue) => string` | Display formatter. Receives the raw value. |

```tsx
<App.Value name="intensity" format={(v) => Number(v).toFixed(2)} />
```

Without `format`, scalars render via `String()`, arrays comma-joined, and a
`string[][]` table joins cells with `, ` and rows with `|` so a one-line
readout of one stays legible. [`<Table>`](#table) is the real component for a
table; this is sensible degradation, not the intent.

This is also the right component for a parameter you've declared read-only, and
for any scalar [readout](touchdesigner-setup.md#readouts) — authoring it as a
readout means it never even produces an error.

---

## `<Table>`

Renders a `<table>`. Binds a `string[][]`
[readout](touchdesigner-setup.md#readouts) — a whole DAT table. Read-only: like
`<Value>` it subscribes to inbound updates, never sends, and never participates
in focus/echo logic, because a table readout has no parameter behind it to write
to.

| Prop     | Type                         | Default | Description                                  |
| -------- | ---------------------------- | ------- | -------------------------------------------- |
| `name`   | `string`                     | —       | Readout to read.                             |
| `header` | `boolean`                    | `false` | Render row 0 as a `<thead>` of `<th>` cells. |
| `format` | `(cell, row, col) => string` | —       | Per-cell formatter.                          |

```python
# TD side
READOUTS = {'cues': {'op': '/project1/cue_table', 'type': 'string[][]'}}
```

```tsx
<App.Table name="cues" header format={(cell, row, col) => (col === 1 ? `@${cell}` : cell)} />
```

**`format` receives the cell's index in the original table**, not its index
within `<tbody>` — so a formatter keyed on row 3 doesn't shift meaning when
`header` is toggled. With `header`, the head row is row 0 and the first body row
is row 1.

**Rows and cells render index-keyed**, so a table that changes every frame
rewrites cell text in place rather than tearing down and rebuilding the DOM.

**Ragged rows render at their own lengths.** TD tables are rectangular, but
nothing on the wire enforces that, and a short row must not shift the cells of
the rows after it.

Before the first snapshot lands — or if the name turns out not to carry a table
at all — it renders empty rather than throwing. A name/type mismatch is
schema-vs-config drift that the console already reports; a component is the wrong
place to escalate it into a render crash.

---

## `<Video>`

Renders a `<video>`. Requires `video` on the `<Provider>`; without it, it throws
a pointed error rather than rendering black.

| Prop     | Type     | Description                                       |
| -------- | -------- | ------------------------------------------------- |
| `stream` | `string` | Announced stream id. Omit for the primary stream. |

```tsx
<App.Provider url={url} video={{ receivers: 8 }}>
  <App.Video /> {/* the primary stream */}
  <App.Video stream="tile3" /> {/* selected by announced id */}
</App.Provider>
```

The `<video>` is `muted autoplay playsinline`. **`muted` is what makes autoplay
legal without a user gesture** — an unmuted stream silently never starts. All
three are overridable through props if you add audio later, which would then need
a user-gesture unmute.

Several `<Video>` on the same id are handed the _same_ `MediaStream`, so the
browser decodes it once no matter how many tiles show it — a wall tile and a
detail pane cost one decode.

Stream ids come from TD's `streams` announcement, re-sent on every renegotiation,
so a tile rebinds automatically if track `mid`s shift. For per-tile status
overlays see [`useVideo()`](api.md#video).

A `<Video>` whose stream is switched off (see below) renders **blank**, not its
last frame: a stopped encoder leaves the track live and silent, so holding the
last decoded frame would read as running video.

## `<StreamToggle>`

Checkbox that starts and stops one stream's TouchDesigner-side encoder. Requires
`video` on the `<Provider>`, same as `<Video>`.

| Prop     | Type     | Description                                       |
| -------- | -------- | ------------------------------------------------- |
| `stream` | `string` | Announced stream id. Omit for the primary stream. |

```tsx
<For each={video.streams()}>
  {(s) => (
    <figure>
      <App.Video stream={s.id} />
      <label>
        <App.StreamToggle stream={s.id} />
        {s.label ?? s.id}
      </label>
    </figure>
  )}
</For>
```

It binds a **stream id, not a parameter** — the thing it drives is an operator
`td-core` generates, so it takes no schema typing and needs no `REGISTRY` entry.
Otherwise it behaves exactly like [`<Toggle>`](#toggle): optimistic write,
corrected by TD's next `stream-state`, and it follows a flip made in TD's own
parameter dialog.

**Turning a stream off stops its encoder and everything feeding it in TD**, so it
costs nothing while off — that is the point of the control, and what lets a
project offer more streams than the machine can run at once. The peer is
untouched, so a stream comes back on TD's next frame with no renegotiation. See
[TouchDesigner setup § Turning streams on and off](touchdesigner-setup.md#turning-streams-on-and-off).

It renders **disabled until TD has announced a state** for that id. An id with no
generated encoder never becomes clickable, which is the difference between "off"
and "TD can't serve this".

## Styling

`td-core` ships **zero CSS**. Every component renders bare HTML with a stable
class hook and passes through `class`, `style`, and everything else.

| Component        | Class                                                      |
| ---------------- | ---------------------------------------------------------- |
| `<TextInput>`    | `.td-text-input`                                           |
| `<NumberInput>`  | `.td-number-input`                                         |
| `<RangeInput>`   | `.td-range-input`                                          |
| `<Toggle>`       | `.td-toggle`                                               |
| `<Button>`       | `.td-button` plus `.td-button-pulse` / `-hold` / `-toggle` |
| `<Select>`       | `.td-select`                                               |
| `<Vector>`       | `.td-vector`, sub-inputs `.td-vector-input`                |
| `<Color>`        | `.td-color`, `.td-color-rgb`, `.td-color-alpha`            |
| `<Value>`        | `.td-value`                                                |
| `<Table>`        | `.td-table`                                                |
| `<Video>`        | `.td-video`                                                |
| `<StreamToggle>` | `.td-stream-toggle`                                        |

**A `class` prop adds to the hook rather than replacing it.**
`<App.Toggle name="x" class="mine" />` renders `class="td-toggle mine"`, so the
hooks above — and the `:disabled` states below — keep working on a styled
control. `classList` still works for conditional styling on top.

`<Button mode="hold">` and `mode="toggle"` expose their state through
`aria-pressed`, so `[aria-pressed='true']` is the right selector for an active
style — no extra prop needed. Disabled controls (read-only parameters) carry the
standard `:disabled` state.
