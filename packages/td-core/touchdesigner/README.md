# TouchDesigner side

The other half of the bridge. Three project-agnostic Python files you drop into
any project unchanged, plus a config template you edit.

| File | Loaded into | Edit? |
|---|---|---|
| [`webserver-callbacks.py`](webserver-callbacks.py) | Web Server DAT's Callbacks DAT | Never |
| [`parameter-execute.py`](parameter-execute.py) | A Parameter Execute DAT | Never |
| [`webrtc-callbacks.py`](webrtc-callbacks.py) | WebRTC DAT's Callbacks DAT — video only | Never |
| [`config-template.py`](config-template.py) | A Text DAT named `config` | **Yes** — copy it into your project |

Everything project-specific lives in your config: which operators and parameters
to expose, and which TOPs carry which video streams. The three scripts find it
through the `WebGuiServer` component's global OP shortcut, which is what lets
them be dropped in unchanged no matter where the component sits.

**→ [Full walkthrough: ../docs/touchdesigner-setup.md](../docs/touchdesigner-setup.md)**

Load each file into its DAT with **Sync to File** on, so edits land without a
copy-paste. Each file's module docstring documents the parameters you have to set
by hand on the DAT itself — those are parameters rather than values that can be
read from the config.
