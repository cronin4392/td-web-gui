# TODO

Loose items to come back to — not yet promoted into `prds/` (which may or may not happen).

- [ ] Write a Python script (TD-side) that loops through `REGISTRY` in the project's `config` DAT
      (`td/config.py`) and automatically creates/adds the corresponding custom parameters on each op
      it references, instead of creating them by hand in the TD GUI.
- [x] Add x (delete) button to recent phrases
- [ ] Add an explicit `'op'` wire type to `REGISTRY` (`td/config.py`) for OP-reference custom pars
      (e.g. `selectedLoader`), instead of detecting them in `_read` (`packages/td-core/touchdesigner/webserver-callbacks.py`) via
      `hasattr(value, 'path')` duck-typing. Will matter more once there are several of these.
- [x] Add clear buttons to the right of each text1 text2
- [ ] Add a pytest suite for the TD-side Python bridge (`packages/td-core/touchdesigner/webserver-callbacks.py`,
      `packages/td-core/touchdesigner/parameter-execute.py`) — currently zero automated coverage vs. thorough vitest coverage on
      the JS side. Needs lightweight fakes for TD's `op`/`Par`/`webserverDAT` since they aren't
      importable outside TD. Cover at minimum: `broadcast_param_change`'s REGISTRY matching (including
      the silent no-op when a par name/case doesn't match — the failure mode that made a real TD → web
      broadcast bug hard to find), `onWebSocketReceiveText`'s `update`/`pulse`/`snapshot-request`
      dispatch and error replies, and `_snapshot`/`_read`/`_write` round-tripping each wire type. Also
      sweep the rest of `td/` for other Python that's currently untested and add coverage there too.
- [ ] Add a TouchDesigner tag and/or comment to each op that's connected and what param is connected. Automatically keep them up to date.
- [ ] Add a component that will read in performance metrics from a TD instance. FPS, GPU memory, dropped frames, etc. It should be configurable to what metrics to show
- [ ] Investigate not using the VideoStreamOutTOP because it limits this to Nvidia cards
- [ ] If an input doesn't have a value yet in web show something, maybe skeleton state?
- [ ] Reinit packages\td-core\touchdesigner\webgui-server-ext.py when config.py changes
- [ ] Automatically create videostreamoutTOP inside the WebGuiServer based on config. Then handle the flip x in there.
- [ ] On TD close, delete all the watcher DATs
