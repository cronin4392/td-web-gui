# TODO

Loose items scoped to this app. Repo-wide items live in the root `TODO.md`.

- [ ] Check if layout, color, and text get cleared on reset
- [ ] Check if layout and color get cleared when scene changes

## Full text management

Right now GUI.toe is where text management occurs. It has a DAT (typically with 5 rows) that's populated with words I've picked before hand (artist name, crew, venue, etc). The first two rows of that dat can be overwritten (which is where TextSelector comes in). I'd like to move off of GUI.toe and shift over to the full management happening in the web app.

First lets focus on UI/UX edits in the web app. Do these changes without changing up how signals are communicated with TD.

- In TextSelector I want an edit mode. When in edit mode I can add/remove new text fields. I can set the default value of a text field. When edit mode is off, the default value of the text field is shown as the placeholder. When I type in the text input, it overrides the default value.

Things I will follow up with in TD:

- [x] Move text management out of /GUI/ExternalScenes/SceneA
  - [x] The comp has text1 and text2 par, remove — `td/gui-config.py` no longer
        registers them, so the pars are free to delete in TD
  - [x] /GUI/ExternalScenes/SceneA/TextList is building up the text DATs — the
        web builds each Layer's list now
- [x] Send text lists from web -> scene loaders — `setTextList` in
      `td/scene-config.py`, pushed by `src/wordbank/createTextPush.ts`
- [~] Remove iop.Inputs.TextVars references from scenes — superseded, not done.
  The scenes keep reading `TextVars`; the DAT behind it moved to the loader
  shell and the web fills it, so the scene-side read never had to change.

Left to do in TD (untested by CI — nothing here runs the Python):

- Confirm the `TEXT_LIST` path in `td/scene-config.py` (`/Scene1/Inputs/text_list`)
  names a real Text DAT in the loader shell, and build it if it isn't there. It
  must live in `Inputs`, not in the loaded tox, or a `loadScene` swap would take
  it with the scene.
- Point `iop.Inputs.TextVars` at that DAT and unwire whatever fed it before.
- Delete the now-unregistered `Text` / `Text2` pars on
  `/GUI/ExternalScenes/SceneA … SceneZ4`.
