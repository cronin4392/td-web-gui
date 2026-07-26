# TouchDesigner side

The other half of the bridge. Four project-agnostic Python files you drop into
any project unchanged, plus a config template you edit.

| File | Loaded into | Edit? |
|---|---|---|
| [`webserver-callbacks.py`](webserver-callbacks.py) | Web Server DAT's Callbacks DAT | Never |
| [`webgui-server-ext.py`](webgui-server-ext.py) | A Text DAT named `WebGuiServerExt`, wired as the component's extension | Never |
| [`parameter-execute.py`](parameter-execute.py) | Nothing by hand — the extension generates the DATs that load it | Never |
| [`webrtc-callbacks.py`](webrtc-callbacks.py) | WebRTC DAT's Callbacks DAT — video only | Never |
| [`config-template.py`](config-template.py) | A Text DAT named `config` | **Yes** — copy it into your project |

You never create a Parameter Execute DAT yourself. `WebGuiServerExt` reads the
config's `REGISTRY` and generates one per operator it references, each watching
exactly that operator's registered parameters. Add a registry entry and the
watcher follows.

Everything project-specific lives in your config: which operators and parameters
to expose, and which TOPs carry which video streams. The three scripts find it
through the `WebGuiServer` component's global OP shortcut, which is what lets
them be dropped in unchanged no matter where the component sits.

**→ [Full walkthrough: ../docs/touchdesigner-setup.md](../docs/touchdesigner-setup.md)**

Load each file into its DAT with **Sync to File** on, so edits land without a
copy-paste. Each file's module docstring documents the parameters you have to set
by hand on the DAT itself — those are parameters rather than values that can be
read from the config.
