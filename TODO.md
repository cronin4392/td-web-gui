# TODO

Loose items to come back to — not yet promoted into `prds/` (which may or may not happen).

- [ ] Write a Python script (TD-side) that loops through `REGISTRY` in `td/webserver-callbacks.py`
      and automatically creates/adds the corresponding custom parameters on each op it references,
      instead of creating them by hand in the TD GUI.
- [x] Add x (delete) button to recent phrases
- [ ] Add an explicit `'op'` wire type to `REGISTRY` in `td/webserver-callbacks.py` for OP-reference
      custom pars (e.g. `selectedLoader`), instead of detecting them in `_read` via
      `hasattr(value, 'path')` duck-typing. Will matter more once there are several of these.
      `_read` now lives in the shared half of both callbacks files — change it in both.
- [ ] Convert localStorage into a sqlite3 database for text-setter
- [x] Add clear buttons to the right of each text1 text2