---
'upwell': patch
---

Fix the floating prompt and restart bar losing taps on Android to views rendered after `<UpwellUI />` (toasts, tab bars, LogBox). They were drawn below the prompt but still received its touches.
