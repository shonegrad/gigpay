# GigPay prototype — handover document

Handover date: 2026-10-20
State: working, demo-ready, verified (headless browser + screenshots); no tests committed yet.

## 1. What this is

An interactive, dependency-free prototype of the **GigPay** product-design case
study: how a marketplace worker moves from **completed work → invoiced → funds
credited → payout initiated → reviewed → received**, including every exception
path and the interface designed for it.

- "GigPay" is a **pseudonym** for a real product inside the LiveXchange / GigCX
  ecosystem. All names, amounts, rates, and timelines are fictional and
  generalized to respect confidentiality. The demo worker is
  **Nebojsa Despotovic** ("ND", the avatar in the header).
- Everything is **vanilla HTML/CSS/JS**. No dependencies, no build step, no
  bundler, no framework. You can open `index.html` straight from disk.
- The demo is **semi-live**: confirming a payout really updates balances and
  creates a trackable record; exception actions really mutate data and resume
  flows. Simulated bank-side delays make progression feel real.

## 2. Repository layout

| File | Role |
| --- | --- |
| `index.html` | App shell: header + main nav, ND avatar + guide menu, modal, toast containers. Loads `data.js` then `app.js`. |
| `app.js` (1327 lines) | All logic: `state`, helpers, `SCREENS` renderers, payout progression engine, delegated event handling, avatar menu logic, init. |
| `data.js` (546 lines) | Seeded `DATA`: balances, 13 earnings, 4 destination methods, 10 payouts (incl. 3 exception records). Original demo data only. |
| `styles.css` (1819 lines) | Design system (CSS custom properties), components, light default theme + `:root[data-theme="dark"]` opt-in block, and a global `[hidden]` rule (see §7). |
| `README.md` | Product-facing summary, exception coverage, controls, demo script. |
| `docs/` | This handover + development guide. |

## 3. Data model (`data.js`)

```text
DATA = {
  worker: { name: "Nebojsa Despotovic", initials: "ND", ... },
  balances: [ USD, EUR ],              // { currency, currencyName, available, pending }
  earnings: [ ... 13 items ],          // id e-XXXX, client, workPeriod, currency,
                                       // amount, status, timeline[], payoutRef (when paid)
  methods:  [ ... 4 items ],           // id m-1..m-4, type bank|wallet|card,
                                       // verification: "verified"|"pending-verification",
                                       // fee string, arrival estimate
  payouts:  [ ... 10 items ],          // id po-XXXX, created, amount/currency,
                                       // destination (method id) + label, status,
                                       // fee, net, netCurrency, rate, timeline[],
                                       // estimatedArrival / completedOn
}
```

Status vocabularies (badge map `S` in `app.js`):

- Earnings: `available`, `pending`, `paid`, `issue`.
- Payouts: `processing`, `completed`, `failed`, `review`, `action-needed`.
- Methods: `verified`, `pending-verification`.

Exchange/money rules:

- Rates: `RATES = { "USD->EUR": 0.92, "EUR->USD": 1.08 }` (`convert()` helper).
- Fees: bank flat 1.50, wallet flat 0.30, card 1.2% of amount (text in `data.js`,
  numbers computed at confirm time in `app.js`).
- Available balances only decrease on confirm; failed transfers return amounts.

**Seed reconciliation (do not break it when editing `data.js`):**

- USD available **1842.50** = e-1042 (1212.50) + e-1032 (630)
- USD pending **1414.00** = e-1041 (864) + e-1035 (210) + e-1046 (340, the
  deliberate *Issue found* row)
- EUR available **315.40** = e-1039 (315.40); the two remaining EUR earnings are
  pending/paid history

## 4. Application architecture (`app.js`)

- **Rendering**: one renderer per screen in the `SCREENS` map (`overview`,
  `earning-detail`, `payout-start`, `payout-review`, `payouts`, `payout-detail`,
  `methods`, `help`, `diagram`). `go(screen, options)` swaps
  `#main-content` innerHTML and syncs nav highlight. There is no router, no
  virtual DOM; re-render is full-screen.
- **State**: single top-level `state` object (currency, screen, detailId,
  payoutDraft, activePayoutId, menuView, diagramView, lastRef).
- **Events**: one delegated `document` click listener with a long
  `closest("[data-go],…")` selector list and a switch on the matched
  `data-*` attributes. **Every new action attribute must be added to both the
  `closest()` list and the switch** — this is the #1 convention to preserve.
- **Engine** (simulated bank side):
  - `advancePayout(p)` — sets current timeline events to `completed`.
  - `scheduleCompletion(p, delay)` — timer in the module-level `payoutTimers`
    Set; moves payouts from `processing` to `completed`.
  - `resolveHold(p, title, description)` — action clears a hold, adds a
    timeline event, and re-schedules completion.
- **Toast/modal**: `toast(type, title, message)` appends to `#toast-container`;
  `modal` object owns `#modal-overlay`.

## 5. Screens & flows

Demo journey: Earnings overview → earning detail → payout setup
(destination cards + live `#dest-summary` strip + keep/convert currency radio)
→ payout review (fee/rate/net breakdown) → confirm modal → payouts history →
payout detail (Amount details / Transfer details / timeline) → simulated
completion.

Exception records seeded intentionally:

| Ref/Earning | State | Actions wired |
| --- | --- | --- |
| `e-1046` | Issue found (client disputed invoice lines) | Resubmit invoice → pending |
| `po-8826` | Failed — bank rejection | Retry payout, Change method |
| `po-8846` | Failed — destination daily limit (250.00) | Send partial payout |
| `po-8842` | Action needed — outdated destination details | Update details modal |
| `po-8844` | Under review → information requested | Provide requested info |
| `po-8837` | Action needed — unverified card (m-4) | Verify card |
| `po-8819` | Under review — standard | Support route |

Every resolution path: timeline grows, status moves to `processing`, and the
same simulated completion applies. Paid earnings link to their payout via
`payoutRef` ("Track payout" button).

## 6. ND avatar menu (prototype guide)

- Two-pane dropdown: **titles only** on the left (grouped Guide / Views /
  Diagrams / Controls), content **canvas** on the right for the text sections
  (`guide`, `journeys`, `exceptions`, `controls` canvases live in
  `index.html`; state key `state.menuView`).
- **Group navigation**: each canvas has chip navigation to its sibling
  (Guided views ↔ Exception walkthroughs).
- **Diagrams are different**: clicking *Workflow diagram* or *State machine*
  **closes the menu** and renders the diagram **full-width** in the app
  (`SCREENS["diagram"]`, state key `state.diagramView`), with a chip to swap to
  the other diagram.
- Walkthrough links (journeys/exceptions) close the menu and navigate the app.
- Closes on outside click (capture-phase listener), `Escape`, and any
  navigation pick. Reopening highlights the last shown view.

## 7. Design system & CSS gotchas

- Fully tokenized: spacing/font/radius/shadow/z-index on `:root`; light theme
  default, dark via `:root[data-theme="dark"]` override block.
- **`[hidden] { display: none; }` sits at the very end of `styles.css`** — the
  menu is `display: flex`, and without this author rule the hidden attribute
  is overridden by the flex rule (this was a real released bug: the menu
  looked open while logically hidden). If you add `display:*` to any element
  that toggles `hidden`, rely on the global rule; never re-declare `display`
  after it. The modal uses the alternative `:not([hidden])` pattern.
- The payout timeline is deliberately simplified: a left rail
  (`border-left`), no bullet dots, state colors applied to the event title
  (processing/current = primary, failed = error, warning = warning).
- A `.table-container` nested directly in a `.card` (History tables on
  earnings overview and payouts) is borderless and square — the card frame
  provides border and corners; tables never carry their own top radius.

## 8. Known limitations / next steps

- No persistence: state resets on reload; *Reset demo data* just reloads.
- Timers are skipped by design in headless runs; the demo script includes
  "Simulate completion" buttons so a presenter never waits.
- poc-header nav and bottom nav are static markup duplicated twice
  (desktop/mobile) — a candidate for future dedup if the shell grows.
- Tests are documented as a pattern (see `docs/DEVELOPMENT.md` § Verification)
  but the 67-assertion harness was a temporary file, deleted after the run it
  served. Re-commit it as `tests/` if the prototype goes back into active
  development.
- Possible future work: print/PDF export of the case study; deeper
  N26 EUR exception coverage; keyboard navigation polish for the menu tree;
  making `data.js` split (scenario presets) so stakeholders can flip through
  different demo datasets.
