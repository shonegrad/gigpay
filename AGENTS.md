# AGENTS.md — guidance for coding agents (opencode/Claude/etc.)

## Project one-liner

Dependency-free interactive prototype of the "GigPay" payouts case study
(HTML/CSS/JS only). Original demo data — do not copy real-world names or
real bank details; everything here is fictional by design.

## Ground rules for this repo

1. **No dependencies, no build step.** Never add npm packages, bundlers, or
   frameworks. Never add a `package.json`. The whole app is 4 hand-written
   files.
2. **Simulate only, never fetch.** Timelines, reviews, and completions are
   driven by `setTimeout` in `app.js` (`scheduleCompletion`,
   `resolveHold`, `payoutTimers`). No network calls.
3. **Delegated actions**: any new interactive `data-*` attribute must be
   registered in BOTH (a) the `closest()` selector list and (b) the switch of
   the delegated `click` listener in `app.js`. Forgetting (a) silently
   dead-ends the action.
4. **Keep the seed reconciled.** The Available/Pending balance figures are the
   sum of specific seeded earnings (see `docs/HANDOVER.md` §3). If you touch
   `data.js`, verify those sums still hold, or update the handover table on
   purpose.
5. **CSS hidden semantics**: the global `[hidden] { display: none; }` rule
   (end of `styles.css`) exists because `display: flex` on the avatar menu
   overrode the `hidden` attribute — that was a shipped bug. When testing
   visibility changes, assert on `getComputedStyle(...).display`, not only
   the attribute.
6. **Timeline component is simplified**: left rail, no dots, state color on
   the event title. Do not reintroduce `::before` dot markers or `<ol>`
   numbering.
7. **Avatar menu contract**:
   - Menu shows titles only; text sections (guide/journeys/exceptions/
     controls) render inside the menu's canvas pane; sibling chips switch
     within the group.
   - Diagram titles (workflow/statemachine) close the menu and render
     full-width via `SCREENS["diagram"]`.
   - Walkthrough links close the menu and navigate the app.
   - Outside click (capture phase), Escape, and any navigation pick close it;
     reopening must highlight the last shown view (`state.menuView`).

## Verification loop (run after every change)

1. `node --check app.js && node --check data.js`
2. Headless smoke: load a temp copy with an error-collector script, assert no
   uncaught errors (exact commands in `docs/DEVELOPMENT.md` §6).
3. For behavior changes: drive the real functions headlessly with a shim
   script (`go(...)`, `openAvatarMenu()`, `.click()`), report via a
   `data-check` attribute on `documentElement`, run with
   `--dump-dom` and grep it. Use `--virtual-time-budget` so timers settle.
4. For visual changes: screenshot with `--force-device-scale-factor=1`;
   remember headless window width clamps (~500px) and clips to the requested
   width — verify suspected "overflow" in a real browser before changing CSS.

## Editing-tool traps seen in this workspace

- Some write/edit tools unescape HTML entities. `esc()` deliberately builds
  `&` with `String.fromCharCode(38)`; don't count on `&amp;` surviving an
  edit round-trip.
- `sed` treats `&` in the replacement as "the whole match" — injecting JS
  with `&&` through `sed` corrupts it; use a Python heredoc for injections.
- `textContent` matching never sees `text-transform: uppercase` results;
  match on the original case.

## Style

- Match the existing code style: `const` arrows, template literals, 2-space
  indent, no classes. Screen renderers return template strings.
- Comments only where the "why" isn't obvious, and only if necessary — the
  codebase stays lean.
- All content (names, amounts, copy) is fictional; keep it that way.
