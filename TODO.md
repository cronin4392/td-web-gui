# TODO

Loose items to come back to — not yet promoted into `prds/` (which may or may not happen).

- [x] Add an explicit `'op'` wire type to `REGISTRY` (`td/config.py`) for OP-reference custom pars
      (e.g. `selectedLoader`), instead of detecting them in `_read` (`packages/td-core/touchdesigner/webserver-callbacks.py`) via
      `hasattr(value, 'path')` duck-typing. Will matter more once there are several of these.
- [ ] Add a pytest suite for the TD-side Python bridge (`packages/td-core/touchdesigner/webserver-callbacks.py`,
      `packages/td-core/touchdesigner/parameter-execute.py`) — currently zero automated coverage vs. thorough vitest coverage on
      the JS side. Needs lightweight fakes for TD's `op`/`Par`/`webserverDAT` since they aren't
      importable outside TD. Cover at minimum: `broadcast_param_change`'s REGISTRY matching (including
      the silent no-op when a par name/case doesn't match — the failure mode that made a real TD → web
      broadcast bug hard to find), `onWebSocketReceiveText`'s `update`/`pulse`/`snapshot-request`
      dispatch and error replies, and `_snapshot`/`_read`/`_write` round-tripping each wire type. Also
      sweep the rest of `td/` for other Python that's currently untested and add coverage there too.
- [x] Add a TouchDesigner tag and/or comment to each op that's connected and what param is connected. Automatically keep them up to date.
- [x] Automatically create videostreamoutTOP inside the WebGuiServer based on config. Then handle the flip x in there.
- [ ] If an input doesn't have a value yet in web show something, maybe skeleton state?
- [x] 1. Reinit packages\td-core\touchdesigner\webgui-server-ext.py when config.py changes so watchers get created/deleted based on the latest config.
- [x] 2. On TD close, delete all the watcher DATs. On open there shouldn't be any watchers, they should get fully built.
- [ ] 3. Invert ownership of a scene's `layout` and `color`, the same way loading a tox now works.
      Today the GUI project owns them (`/GUI/ExternalScenes/Scene<X>` custom pars `Layout`/`Color`,
      set by `GUI/ExternalScene.py`'s `LoadComp`) and pushes them to the scene over Touch In/Out,
      where `Tools/SceneLoader/Inputs.py` reads them back as CHOP channels
      (`op('null_mix_params')['Layout']` / `['Color']`). That's why `loadScene` in
      `apps/vj-gui/td/scene-config.py` carries only a path: there is no writable par on the
      SceneLoader to set, so the web can't drive them without going through the GUI.
      Instead: **SceneLoader owns `Layout` and `Color` as its own params**, referencing nothing
      upstream, and anyone who needs to _read_ them (the GUI) pulls them from the scene. The web
      then sets them by calling the scene instance directly, exactly like `loadScene` — probably a
      `setMix`-style handler beside it, or extra optional args on `loadScene` so a scene and its
      layout land in one call. Follow-up once that exists: add them to `SceneCalls` in
      `apps/vj-gui/src/td.config.ts` and surface them in the UI.
- [x] Investigate why some tags are not showing up in the scene loader tags. black, dancer, flashing, flowers, future
- [x] Convert SceneLoader using a TD derived dat (parsed from scene json files) into my sqlite database.
- [ ] Add sqlite database to version tracking
- [ ] Wire midi controls (from Input.toe) to trigger callbacks in web (like selectedScene)
- [x] In SceneLoader.toe the WebGuiServer is a global and therefore can't be embedded in each scene loader. Leave as a global or allow for multiple? Right now it references the global inside itself.
- [ ] DDD refactor of packages/td-core
  - [x] Move UBIQUITOUS_LANGUAGE.md into apps/vj-gui
- [ ] Re-cooking the callbacks DAT (`packages/td-core/touchdesigner/webserver-callbacks.py`) silently
      loses every live WebRTC peer. `clients` already self-heals — `onWebSocketReceiveText` re-adds
      the sender on every message, which the heartbeat guarantees within one interval — but
      `peer_by_client` / `client_by_peer` have no equivalent, and nothing re-registers them. The
      sockets and the peers both stay up, so there is no error anywhere; what breaks is everything
      that looks a peer up by client. `reattach_streams()` becomes a silent no-op, so video cannot be
      restored after a rebuild until the browser renegotiates of its own accord (a page reload, or
      the peer failing). Hit while editing that file with a browser connected — an ordinary
      dev-loop action, not an exotic one. Options: re-derive the tables from the WebRTC DAT's
      connection table on module load, or have the web re-offer when it sees a `snapshot` arrive on
      a socket whose peer TD no longer claims. The second is probably right, since only the browser
      knows which peer id is its own.
