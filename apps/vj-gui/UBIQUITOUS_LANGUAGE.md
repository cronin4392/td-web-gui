# Ubiquitous Language

The vocabulary `apps/vj-gui` uses for itself and the TouchDesigner projects behind it.
Terms are canonical: prefer them in code, tests, commits, and conversation.

Scope is this app only. `td-core` is a general-purpose library and knows none of
these terms — it has instances, params, calls, and streams. Paths below are
relative to `apps/vj-gui`.

## Loadable content

| Term       | Definition                                                                               | Aliases to avoid                    |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| **Tox**    | A TouchDesigner `.tox` component file, the only unit a Loader can load                   | Component, patch, file              |
| **Scene**  | A folder holding a `meta.json` and a matching `<name>.tox`, pickable with a thumbnail    | Visual, clip, source                |
| **Effect** | A folder holding a matching `<name>.tox`, pickable by name alone                         | Filter, FX, overlay, post           |
| **Group**  | The first-level folder an Effect sits under on disk, historically its tag — not modelled | Category, effect tag, effect folder |

## Catalogs

| Term               | Definition                                                                             | Aliases to avoid            |
| ------------------ | -------------------------------------------------------------------------------------- | --------------------------- |
| **Scene catalog**  | Every Scene the GUI can offer, plus the Tags in picker order                           | Scene library, scene list   |
| **Effect catalog** | Every Effect the GUI can offer, in name order                                          | Effect library, effect list |
| **Sync**           | Reconciling a catalog with the folders on disk: rows added, updated, pruned            | Refresh, reindex, import    |
| **Scan**           | Reading the folders on disk into catalog rows, without touching a database             | Crawl, walk, discover       |
| **Snapshot**       | The tracked `data/snapshots/*.sql` text a catalog or the Wordbank is exported to       | Dump, backup, fixture, seed |
| **Export**         | Writing a catalog or the Wordbank out to its Snapshot                                  | Save, dump, commit          |
| **Restore**        | Rebuilding a `.db` from its Snapshot; the rows are ready to serve as they land         | Import, load, seed          |
| **Tag**            | A label a Scene carries, used to filter the Scene picker; authored, never scanned      | Category, genre, keyword    |
| **Rank**           | A Scene's manual sort weight; higher sorts first, absent sorts last                    | Priority, order, weight     |
| **Hidden**         | A Scene or Effect the picker leaves out; authored in the GUI, never scanned            | Disabled, archived, deleted |
| **Favorite**       | An Effect the picker also lists up top; authored in the GUI, never scanned             | Starred, pinned, bookmarked |
| **Edit mode**      | The picker state that reveals Hidden entries and offers every authored edit but filing | Manage mode, admin, unlock  |
| **Tag rail**       | The Scene picker's row of Tags under the grid, in picker order, with All pinned first  | Tag list, sidebar, tabs     |

## Playback

| Term               | Definition                                                                               | Aliases to avoid            |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| **Layer**          | One of the GUI's addressable output slots, each backed by its own TouchDesigner process  | Channel, deck, slot, output |
| **Loader**         | The TouchDesigner component inside a Layer that swaps the Tox currently playing          | Player, host, container     |
| **Selected layer** | The Layer that a pick in the GUI acts on                                                 | Active deck, current output |
| **Z layer**        | One of the four Layers above the eight-deep stack — `Z1`–`Z4`; held, not performed       | Overlay, aux, extra layer   |
| **Load**           | Telling a Layer's Loader to play a given Tox path                                        | Play, fire, trigger, cue    |
| **Input project**  | The `.toe` holding the rig's MIDI and audio front end, separate from the GUI project     | MIDI project, controllers   |
| **BPM**            | The tempo the Input project detects, in beats per minute, published read-only to the web | Tempo, beat, rate, speed    |
| **Beat period**    | How many beats one cycle of the rig's beat-driven motion lasts — 1, 2 or 4               | Division, multiplier, bars  |
| **Status bar**     | The bar along the bottom of the GUI, each item reading its own TouchDesigner process     | Footer, toolbar, tempo row  |

## Color

| Term              | Definition                                                                                            | Aliases to avoid                    |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Color scheme**  | One selectable set of colors, a COMP in the GUI project; its path is its identity on the wire         | Palette, swatch, color, gradient    |
| **Color group**   | The COMP a Color scheme is filed under, and one tab in the picker — Colors, Spectrum, Ramp, RampWhite | Category, color tag, palette folder |
| **Active scheme** | The Color scheme currently driving the GUI, held in TD's `Activecolorpath`                            | Current color, selected palette     |
| **Ramp**          | The gradient a Color scheme paints, sampled by TD into stops the web draws as CSS                     | Gradient, colormap, LUT             |

- A **Color scheme** sits inside exactly one **Color group**; scheme names repeat across groups (`BlueGreen` is in both Colors and Spectrum), so a name alone never identifies one.
- Selecting a **Color scheme** writes its path and nothing else — the **Active scheme** is the only state, and every color TouchDesigner derives hangs off it.
- A **Ramp** belongs to a **Color scheme** and never stands alone; it is what a scheme's swatch draws, and the only reason a scheme is recognisable at a glance.

## Wordbank

| Term            | Definition                                                                                      | Aliases to avoid                    |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Wordbank**    | The saved collection of Phrase lists plus the Recent list, persisted through `/api/wordbank`    | Library, phrase library, text state |
| **Phrase list** | A named, user-ordered collection of Phrases the Wordbank holds                                  | Tab, phrase tab, list               |
| **Phrase**      | A single saved line of text a Phrase list holds, applied to a Layer's text param on pick        | Line, entry, saved text             |
| **Recent**      | The auto-kept list of the most recently applied Phrases; store-managed order, not user-arranged | History, recents                    |

## Relationships

- A **Scene** and an **Effect** each resolve to exactly one **Tox**; the **Loader** cannot tell them apart.
- A **Layer** plays at most one **Tox** at a time; **Loading** replaces whatever was there.
- A **Z layer** is a **Layer** in every respect the wire can see — same process, same schema, same **Loader**. Only the GUI treats it apart, giving it a compact tile with no video and no layout or color.
- A **Scene** carries zero or more **Tags** and at most one **Rank**; an **Effect** carries neither. The **Tags** are authored, the **Rank** is scanned.
- A **Sync** reconciles one catalog against one root folder — the **Scene catalog** and the **Effect catalog** never mix.
- **Hidden**, **Favorite** and **Tags** are the catalog state a **Sync** leaves alone: they are authored rather than scanned, so only **Edit mode** can undo them. They live on the row, so they die with it — a **Scene** deleted from disk does not come back hidden, and does not come back tagged.
- A **Tag** is authored end to end: created, renamed, reordered and deleted in **Edit mode**. A **Scan** never reports one — a Scene's `meta.json` may still list `tags`, but nothing reads it. Deleting a **Tag** keeps every **Scene** that carried it.
- **Filing** a **Scene** under a **Tag** — dragging its tile onto the **Tag rail** — is the one authored edit that needs no **Edit mode**, because it is the one worth doing mid-set. Unfiling still does, and sits beside the scene's hide button.
- A **Tag**'s place in the **Tag rail** is authored too, which is what separates it from a **Rank**: a **Rank** is scanned from `meta.json` and orders **Scenes**, while the rail's order is dragged by hand and orders **Tags**.
- A **Favorite** is a second listing of an **Effect**, not a move: the same **Effect** stays in the full list too, in name order.
- An **Effect** sits inside exactly one **Group** on disk, and the **Effect catalog** deliberately forgets which.
- A **Wordbank** holds one or more **Phrase lists** plus the **Recent** list; a **Phrase list** holds zero or more **Phrases** in a user-set order.
- A **Color group** is not a **Group** (the Effect folder) and its list is not a **catalog** — it is enumerated live from TouchDesigner, not synced from disk.
- Applying a **Phrase** writes it to the **Selected layer**'s text param and adds it to **Recent** — the same "apply" path regardless of which **Phrase list** (or **Recent** itself) it came from.

## Example dialogue

> **Dev:** "The **Effects** are stored two folders deep. Do I keep the first level as a **Tag**?"

> **Domain expert:** "No — that level is just a **Group** I used for filing. Drop it. **Effects** have no **Tags** and no **Rank**; they render as a flat list of names."

> **Dev:** "Then does an **Effect** go in the **Scene catalog** with empty **Tags**?"

> **Domain expert:** "Separate **catalog**, separate database. I never render **Scenes** and **Effects** in one list, so nothing downstream should have to filter them apart."

> **Dev:** "But **Loading** one is the same call?"

> **Domain expert:** "Identical. Both are a **Tox**. The **Loader** takes a path and swaps what the **Layer** is playing — it has no idea whether it's a **Scene** or an **Effect**."

> **Dev:** "And if two **Groups** hold an **Effect** with the same name?"

> **Domain expert:** "That's a filing mistake. Fail the **Sync** and name both folders — silently keeping one would hide the other from me forever."

## Flagged ambiguities

- **"Scene" was overloaded three ways in the code; two remain.** It still means (a) pickable content backed by `meta.json`, and (c) the load operation itself — `loadScene` on the wire, wrapped by `loadToxOn`, which loads any Tox including an **Effect**. Ambiguity (b) — `SceneId`, `sceneInstances`, `SceneConnections` all naming **Layers** — is now **resolved**: those are `LayerId`, `loaderInstances`, `LayerConnections` (and `LoaderId`, `LoaderCalls`, `LoaderParams`, `LoaderClient`, `LoaderProvider`) throughout `src/`. `src/playback/wire.ts` is now the one file where the legacy `scene*` wire vocabulary is still allowed to appear — `loadScene`, `sceneAText1`…`sceneHText2`, and the `sceneA`/`sceneB` instance ids are TD's own contract, not this project's to rename. Renaming the TD-side call itself is a breaking change and has not been done.
- **"Effect" collides with the `3 Effect` group folder.** That folder is one **Group** among several; every folder under the **Effect** root is an **Effect** regardless of which **Group** it sits in.
- **"Library" vs "catalog" — resolved on the GUI side.** What was `library.ts`'s saved text/phrase state is now the **Wordbank** (`domain/wordbank/wordbank.ts`), a name **Catalog** no longer has to share. `sceneLibrary` is still the TouchDesigner-side table this project no longer reads; neither it nor the **Wordbank** is a **catalog** — use **catalog** only for the synced set of **Scenes** or **Effects**.
- **"Sync" runs in two directions.** Server-side `syncScenes` / `syncEffects` reconcile a database against disk; client-side `syncCatalog` / `syncEffectCatalog` ask the server to do that and return the result. Same word, opposite ends of the wire — keep the `*Catalog` suffix for the client-side pair.
