# GigPay prototype — development guide

## 1. Setup

Nothing to install. It is plain static files:

- **Run**: open `index.html` in any modern browser (`open index.html` on macOS).
- **Modify**: any text editor. Refresh to reset all state to seed data.

Optional during development: serve the folder over HTTP to avoid any
file-URL feature restrictions, e.g. `python3 -m http.server`.

## 2. Code conventions

- Keep it dependency-free. No frameworks, no build step. ES2020 syntax is fine
  (object spread, optional chaining, template literals).
- Screens are renderers in the `SCREENS` map (`app.js`); they must be pure-ish
  functions of `state` + `DATA` returning a template string.
- All flow actions are `data-*` attributes handled by the single delegated
  click listener. **When adding an interactive action:**
  1. Add the attribute to the `closest()` selector list in the delegated
     handler.
  2. Add the branch in the same handler's switch.
  3. If it navigates, call `go(...)` with the right `options`
     (`detailId`, `payoutId`, `currency`, `payoutDraft`, `view`, `nav`).
- Money formatting: `fmt(n, currency)` for display, `fmtPlain(n)` for
  inputs; user-visible strings through `esc()` (`esc` internally builds `&`
  via `String.fromCharCode(38)` — see §5).
- Status badges come from the `S` map + `badge(status)`; add new statuses
  there and a matching `.status-*` class in `styles.css`.
- New earned/payout/seed records must keep the reconciliation numbers in
  `docs/HANDOVER.md` §3 true — update that table if you intentionally change
  seed data.
- CSS: use design tokens (`--space-*`, `--color-*`, `--radius-*`) — no raw
  hex values outside the palette definitions. Dark mode is a token override
  block; new components should support it for free as long as they use tokens.

## 3. Behavioral invariants (do not regress)

- The avatar menu must *visually* close: the global `[hidden]` rule in
  `styles.css` makes the `hidden` attribute win over any `display` rule. If
  the menu ever "stays visible after closing", this rule was removed or
  shadowed.
- Clicking a diagram title (Workflow diagram / State machine) closes the menu
  and renders the diagram full-width; text sections show inside the menu
  canvas.
- Confirming a payout must deduct from the selected `available` balance and
  create a trackable record linked from the paid earning.
- Failed transfers return the amount to available; holds never debit twice.

## 4. GIT

The repo is initialized (`git init -b main`) with an initial commit of the
prototype. Conventions going forward:

- `.gitignore` covers macOS cruft (`.DS_Store`) and the temporary test
  scaffolding (`_*` prefixed files, e.g. `_shot1.html`, `_driver.js`).
- Branch naming is free-form; keep commits small and screens-scoped, e.g.
  `payouts: fix partial payout fee label`.
- Do not commit environment files, screenshots, or the temporary harness
  outputs.

## 5. Editing-tool gotchas (learned the hard way)

- **Some file-writing/edit tools unescape HTML entities** in content they
  write. IMPORTANT: that's why `esc()` and the exception link title build `&`
  via `String.fromCharCode(38)`; avoid relying on `&amp;` surviving an edit.
- **`sed` replacement**: remember `&` in the *replacement text* means "the
  whole match" — when injecting a script that contains `&&`/`&` use a Python
  heredoc instead of `sed`.
- **Headless Chrome screenshots**: window width was observed clamped to
  ~500px and screenshots clipped to the requested width. This clipped
  right-side content and looked like an overflow bug — it wasn't real. Use
  `--force-device-scale-factor=1` and verify suspected "overflow" in a real
  browser before alarming changes.

## 6. Verification

Minimum checks after any change:

1. Syntax: `node --check app.js && node --check data.js`
2. Smoke (no uncaught errors on load + first render):

```bash
SFX=$(mktemp -d); cp index.html styles.css data.js app.js "$SFX"/
python3 - "$SFX" <<'EOF'
import sys, pathlib
d = pathlib.Path(sys.argv[1])
js = "window.addEventListener('error',e=>document.documentElement.setAttribute('data-err',e.message));"
html = (d / 'index.html').read_text().replace('</body>', '<script>' + js + '</script></body>')
(d / '_smoke.html').write_text(html)
EOF
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --dump-dom "file://$SFX/_smoke.html" 2>/dev/null | grep -o 'data-err="[^"]*"'
rm -rf "$SFX"   # expect: no data-err output at all
```

3. Behavioral harness (the pattern used for the 67-assertion run; keep it in
   `/tmp` or a `_`-prefixed gitignored file):

   - Copy the four app files to a temp dir
   - Inject a driver `<script>` before `</body>` of a `_check.html` copy:
     drive real interactions with `go(...)`, `openAvatarMenu()`, `.click()`,
     then write results to `document.documentElement.setAttribute('data-check', …)`
   - Assert on **computed styles** when testing visibility (e.g.
     `getComputedStyle(menu).display === "none"`), not just the `hidden`
     attribute — the attribute can be true while a `display` rule keeps the
     element visible (that's the regression class that produced the
     `[hidden]` CSS rule).
   - Run: `chrome --headless --disable-gpu --no-sandbox
     --virtual-time-budget=3000 --dump-dom file:///…/_check.html` and grep
     the `data-check` attribute.
   - Remember `textContent` never shows CSS `text-transform` results: match
     on original case ("State machine", not "STATE MACHINE").

4. Screenshots for visual review:

```bash
chrome --headless --disable-gpu --no-sandbox --force-device-scale-factor=1 \
  --window-size=1100,900 --virtual-time-budget=3000 \
  --screenshot=/tmp/shot.png "file:///path/to/_shot.html"
```
