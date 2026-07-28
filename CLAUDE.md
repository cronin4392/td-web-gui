Web UI that communicates back and forth with TouchDesigner.

## Comments — hard rule

Default to zero comments. Do not add a comment unless it clears this bar: removing it would make a future reader misunderstand _why_ the code does something non-obvious (a workaround, a hidden constraint, a subtlety that isn't visible from reading the code itself). Never write a comment that just restates what the code does in words.

Concretely, this means:

- No docstrings or comment headers on functions/classes whose name and signature already say what they do. Do not add one "for documentation" — that is the default failure mode to avoid.
- No comment blocks explaining what a file or section is for. If it needs explaining at that level, that belongs in a PR description or a project doc, not inline.
- No comment restating a line directly above/below it (`// increment counter` above `count += 1`).
- When a comment is warranted, keep it to one line. Never write a multi-paragraph comment.
- Do not add comments as a byproduct of "being thorough" — thoroughness here means restraint, not documentation coverage.
