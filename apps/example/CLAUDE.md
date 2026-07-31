# example

The reference app. It ships alongside the package, so **it is documentation** —
readers copy from it. Optimize for being read, not for being clever.

## Two pages, and the order they're read in

`minimal.html` (`src/Minimal.tsx`) is the entry point: one instance, five
controls, one tile, in a single file someone can copy whole. `index.html`
(`src/App.tsx`) is the full tour. A reader meets the minimal page first, so
**keep it minimal** — a new capability belongs in `App.tsx`, and only moves here
if the smallest working app genuinely needs it.

## What the full tour is demonstrating

Two TouchDesigner instances at once, one column each, with independent
connections, peers, and parameter schemas. That two-ness is the point: it proves
a wire name belongs to its instance rather than to TouchDesigner, which is why
instance 2's `label` and instance 1's `message` can back the same TD parameter
under different names.

Keep the split intact:

- **Instance 1** is the kitchen sink — one param per control kind, every readout
  shape, both menu cases.
- **Instance 2** is a smaller, differently-named node, including one
  `writable: False` entry demonstrating a read-only param.

If you add a control to the library, exercise it here. Coverage of the public
surface is this app's job.

## Keep the two sides in agreement

`src/td.config.ts` must match `REGISTRY` in `td/Example1/config.py` and
`td/Example2/config.py`. Nothing verifies this — a mismatch is a silent
no-op at runtime, not an error. Each `config.py` docstring documents its own
side; update it in the same change.

## Conventions to preserve

- `src/index.css` is plain CSS against `td-core`'s class hooks, because the
  library ships no styles. Don't add a CSS framework — that would misrepresent
  what the library requires.
- The app imports `td-core` from its built `dist/`, so building the library
  precedes `dev`.
- The `.toe` files resolve **TD Core Dir** with an expression off
  `project.folder`, so a clone needs no per-machine setup. That is a
  repo-only convenience — the depth of these two `.toe` files is fixed here.
  Keep the docs saying a real project sets that parameter by hand, which is
  what `touchdesigner-setup.md` teaches.
- Video walls need an NVIDIA GPU on Windows; parameters work without one. Don't
  make video a prerequisite for the parameter demo.
