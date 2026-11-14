---
'@upwell/cli': patch
---

`policy set latest|minimum --platform ios` writes the build as a string (`"1"`), like `init` and the examples; Android builds stay numbers.
