# TouchDesigner side

The other half of the bridge. Project-agnostic Python files you drop into any
project unchanged, plus a config template you edit.

| File                                               | Loaded into                                                            | Edit?                               |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| [`webserver-callbacks.py`](webserver-callbacks.py) | Web Server DAT's Callbacks DAT                                         | Never                               |
| [`webgui-server-ext.py`](webgui-server-ext.py)     | A Text DAT named `WebGuiServerExt`, wired as the component's extension | Never                               |
| [`parameter-execute.py`](parameter-execute.py)     | Nothing by hand — the extension generates the DATs that load it        | Never                               |
| [`webrtc-callbacks.py`](webrtc-callbacks.py)       | WebRTC DAT's Callbacks DAT — video only                                | Never                               |
| [`config-execute.py`](config-execute.py)           | Nothing by hand — the extension generates the DAT that loads it        | Never                               |
| [`exit-execute.py`](exit-execute.py)               | Nothing by hand — the extension generates the DAT that loads it        | Never                               |
| [`pre-release.py`](pre-release.py)                 | Nothing by hand — the extension generates the DAT that loads it        | Never                               |
| [`config-template.py`](config-template.py)         | A Text DAT named `config`                                              | **Yes** — copy it into your project |

You never create a Parameter Execute DAT yourself. `WebGuiServerExt` reads the
config's `REGISTRY` and generates one per operator it references, each watching
exactly that operator's registered parameters. Add a registry entry and the
watcher follows.

You never create a Video Stream Out TOP yourself either. The same extension reads
`STREAMS` and generates a
`select_<id> → fit_<id> → flip_<id> → videostreamout_<id>` chain per entry,
inside the component — so a stream is one config line naming the TOP you want on
the web. The generated `fit_<id>` caps the resolution the encoder sees (the
entry's `width`, default 480, aspect preserved) and `flip_<id>` deals with the
mirroring TD's WebRTC encoder introduces.

Saving the config is the whole of the work: the extension also generates a
`config_watch` DAT Execute DAT pointed at the config DAT itself, so an edit to
`config.py` on disk reaches the running network — watchers and stream chains
created or deleted to match — with no restart and no manual `Rebuild()`.

The generated watchers and stream chains are a build product, so they are kept
out of every saved artifact rather than reconciled away later. A generated
`exit_watch` Execute DAT deletes them when TouchDesigner closes (and re-runs
`Rebuild()` on Create, which covers reloading the component from an External
`.tox` while it is live), and a generated `pre_release` Text DAT does the same to
the staged copy during an Embody portable `.tox` export — so the component ships
its machinery and none of your project's output.

Everything project-specific lives in your config: which operators and parameters
to expose, and which TOPs carry which video streams. The three scripts find it
through the `WebGuiServer` component's global OP shortcut, which is what lets
them be dropped in unchanged no matter where the component sits.

**→ [Full walkthrough: ../docs/touchdesigner-setup.md](../docs/touchdesigner-setup.md)**

Load each file into its DAT with **Sync to File** on, so edits land without a
copy-paste. Each file's module docstring documents the parameters you have to set
by hand on the DAT itself — those are parameters rather than values that can be
read from the config.
