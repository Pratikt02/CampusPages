# Real-browser checks (reference harness)

These are the scripts used in Phase 7 to check the production build in **real headless Firefox** (Selenium), because jsdom
cannot lay anything out. They are provided as a **reference**; the paths are those of the Linux sandbox they were written in
(`/tmp/e2e`, `/tmp/ffenv`, `/tmp/mongoenv`) and need editing before they run elsewhere. Credentials in them belong to a throwaway
local database.

| File | Purpose |
|---|---|
| `stack.sh` | Starts MongoDB + the API + the built frontend (`CSP=1` serves it with the real `client/public/_headers`), creates users with the real CLI, then seeds. |
| `mkfiles.mjs`, `seed.py` | Generate a 12-page PDF (non-embedded fonts, one landscape page) and a PNG, and upload/publish them through the real admin API. |
| `run.py` | For each of the 7 viewports x page x theme: horizontal-overflow detection, undersized touch targets (<44px), dialog geometry, PDF canvas pixel check, screenshots. Viewports narrower than Firefox's ~500px minimum window (320, 390) are rendered inside a same-origin iframe of that width. |
| `keyboard.py` | Tab order, visible focus indicators, modal focus trap, Escape, keyboard zoom. |
| `csp_server.mjs` | Static server that applies the headers from `_headers`, to prove the app works under the enforced Content-Security-Policy. |

Not covered: Chrome, Safari, real phones/tablets, real touch gestures, screen readers.

## Also here
`stack2.sh` starts the **single-origin** deployment shape (one server on :4000 serving API + built frontend; `LT=1` raises rate limits for load tests); `lt_seed.py` + `mkbig.mjs` create the ~8.5 MB PDF used by `loadtest/`. Same caveats: sandbox paths.
