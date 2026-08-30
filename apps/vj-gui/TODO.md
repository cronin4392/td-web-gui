# TODO

Loose items scoped to this app. Repo-wide items live in the root `TODO.md`.

- [ ] Check if layout, color, and text get cleared on reset
- [ ] Check if layout and color get cleared when scene changes

## Full text management

Right now GUI.toe is where text management occurs. It has a DAT (typically with 5 rows) that's populated with words I've picked before hand (artist name, crew, venue, etc). The first two rows of that dat can be overwritten (which is where TextSelector comes in). I'd like to move off of GUI.toe and shift over to the full management happening in the web app.

First lets focus on UI/UX edits in the web app. Do these changes without changing up how signals are communicated with TD.

- In TextSelector I want an edit mode. When in edit mode I can add/remove new text fields. I can set the default value of a text field. When edit mode is off, the default value of the text field is shown as the placeholder. When I type in the text input, it overrides the default value.

Things I will follow up with in TD:

- Move text management out of /GUI/ExternalScenes/SceneA
  - The comp has text1 and text2 par, remove
  - /GUI/ExternalScenes/SceneA/TextList is building up the text DATs
- Send text lists from web -> scene loaders
- Remove iop.Inputs.TextVars references from scenes
