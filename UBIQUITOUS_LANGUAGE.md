# Ubiquitous Language

The vocabulary this project uses for the VJ GUI and the TouchDesigner projects behind it.
Terms are canonical: prefer them in code, tests, commits, and conversation.

## Loadable content

| Term       | Definition                                                                               | Aliases to avoid                    |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| **Tox**    | A TouchDesigner `.tox` component file, the only unit a Loader can load                   | Component, patch, file              |
| **Scene**  | A folder holding a `meta.json` and a matching `<name>.tox`, pickable with a thumbnail    | Visual, clip, source                |
| **Effect** | A folder holding a matching `<name>.tox`, pickable by name alone                         | Filter, FX, overlay, post           |
| **Group**  | The first-level folder an Effect sits under on disk, historically its tag — not modelled | Category, effect tag, effect folder |

## Catalogs

| Term               | Definition                                                                 | Aliases to avoid            |
| ------------------ | -------------------------------------------------------------------------- | --------------------------- |
| **Scene catalog**  | Every Scene the GUI can offer, plus the Tags in picker order               | Scene library, scene list   |
| **Effect catalog** | Every Effect the GUI can offer, in name order                              | Effect library, effect list |
| **Sync**           | Rebuilding a catalog from the folders on disk, replacing it wholesale      | Refresh, reindex, import    |
| **Scan**           | Reading the folders on disk into catalog rows, without touching a database | Crawl, walk, discover       |
| **Tag**            | A label a Scene carries, used to filter the Scene picker                   | Category, genre, keyword    |
| **Rank**           | A Scene's manual sort weight; higher sorts first, absent sorts last        | Priority, order, weight     |

## Playback

| Term               | Definition                                                                              | Aliases to avoid            |
| ------------------ | --------------------------------------------------------------------------------------- | --------------------------- |
| **Layer**          | One of the GUI's addressable output slots, each backed by its own TouchDesigner process | Channel, deck, slot, output |
| **Loader**         | The TouchDesigner component inside a Layer that swaps the Tox currently playing         | Player, host, container     |
| **Selected layer** | The Layer that a pick in the GUI acts on                                                | Active deck, current output |
| **Load**           | Telling a Layer's Loader to play a given Tox path                                       | Play, fire, trigger, cue    |

## Relationships

- A **Scene** and an **Effect** each resolve to exactly one **Tox**; the **Loader** cannot tell them apart.
- A **Layer** plays at most one **Tox** at a time; **Loading** replaces whatever was there.
- A **Scene** carries zero or more **Tags** and at most one **Rank**; an **Effect** carries neither.
- A **Sync** rebuilds one catalog from one root folder — the **Scene catalog** and the **Effect catalog** never mix.
- An **Effect** sits inside exactly one **Group** on disk, and the **Effect catalog** deliberately forgets which.

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

- **"Scene" is overloaded three ways in the current code.** It means (a) pickable content backed by `meta.json`, (b) a Layer — `SceneId`, `sceneInstances`, `SceneConnections` all name Layers, and (c) the load operation itself, in `loadScene` / `loadSceneOn`, which loads any Tox including an **Effect**. Prefer **Layer** for (b) and read `loadSceneOn` as "load a Tox onto a Layer". Renaming the TD-side call is a breaking change and has not been done.
- **"Effect" collides with the `3 Effect` group folder.** That folder is one **Group** among several; every folder under the **Effect** root is an **Effect** regardless of which **Group** it sits in.
- **"Library" vs "catalog".** `sceneLibrary` is the TouchDesigner-side table this project no longer reads, and `library.ts` is the GUI's saved text/phrase state — neither is a **catalog**. Use **catalog** only for the synced set of **Scenes** or **Effects**.
- **"Sync" runs in two directions.** Server-side `syncScenes` / `syncEffects` rebuild a database from disk; client-side `syncCatalog` / `syncEffectCatalog` ask the server to do that and return the result. Same word, opposite ends of the wire — keep the `*Catalog` suffix for the client-side pair.
