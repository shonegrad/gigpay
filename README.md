# GigPay — Interactive Prototype

An interactive, dependency-free prototype for the **GigPay** product-design case study:
connecting on-demand marketplace work to clear, dependable earnings and payouts.

All names, amounts, rates, fees, and timelines are **fictional and generalized** for
the prototype ("GigPay" is a pseudonym).

## Run it

Open `index.html` directly in a browser, or serve the folder:

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then visit http://localhost:8000
```

No build step, no dependencies. Vanilla HTML/CSS/JS.

## Documentation

- `docs/HANDOVER.md` — full project handover: current state, architecture,
  data model and seed reconciliation, exception coverage, known limitations.
- `docs/DEVELOPMENT.md` — development guide: conventions, invariants,
  verification harness, git conventions.
- `AGENTS.md` — ground rules for AI coding agents working in this repo.

## Structure

| File | Purpose |
|---|---|
| `index.html` | Shell: header, nav, modal, toast containers |
| `styles.css` | Design system: foundations, components, responsive + dark mode |
| `data.js` | Sample data: balances, earnings, methods, payouts (editable) |
| `app.js` | State, rendering (one function per screen), routing, events |

## Screens & flows

### Worker journey
- **Earnings overview** — balances grouped by currency (click a card to switch USD/EUR);
  recent activity table on desktop, card rows on mobile. Available and pending totals
  reconcile with the underlying earnings.
- **Earning detail** — work source, client, period, hours, dated history timeline;
  paid earnings link to their payout with a **Track payout** button.
- **Payout setup** — destination cards with fee + arrival + verification per method,
  live destination summary strip, keep/convert currency with sample rate,
  amount input with **Send all available**, and specific validation messages
  (minimum, over-balance).
- **Payout review** — debited amount, sample rate + timestamp, fee, "You receive"
  (net, conversion-labeled), destination, estimated arrival (labeled as an
  estimate, not guaranteed), and a rate-change notice for conversions.
- **Confirmation** — modal with reference, locked rate, fee, net; deducts the
  balance, creates a trackable payout record, and signs up the record for
  simulated progression.
- **Payout tracking** — history + detail panel: **Amount details** breakdown
  (amount / rate / fee / net), **Transfer details**, status timeline that
  separates confirmed events from estimates.
- **Status progression** — new payouts auto-advance *processing → completed*
  (~9 s, simulated for the prototype); a **Simulate completion** button does it
  manually; completion toasts fire and the paid total updates.

### Deeper exception handling (all actions are functional)
- **Earning issue** (`e-1046`, marked *Issue found*) — a client disputed invoice
  lines; detail explains exactly which lines and why, with **Resubmit invoice**
  (earning returns to *pending*, collection resumes with a new estimate) and
  a support route.
- **Failed — bank rejection** (`po-8826`) — refunded amount is spelled out;
  **Retry payout** creates a real processing record that links back to the
  failed one, **Change method** swaps destination with recomputed fee/net.
- **Failed — daily limit** (`po-8846`) — failed because the destination's daily
  receiving limit was reached; **Send partial payout** creates a real record
  for the allowed remaining amount and marks the failed one with a follow-up
  event.
- **Action needed — outdated destination details** (`po-8842`) — a
  **Update destination details** modal (simulated form with specific
  validation) re-approves and resumes the transfer.
- **Under review → information requested** (`po-8844`) — review escalated into
  an info request; **Provide the requested info** clears it and resumes
  processing.
- **Action needed — unverified card** (`po-8837`) — **Verify card** flips the
  method to verified and resumes the held transfer.
- **Under review — standard** (`po-8819`) — no action needed, notification
  expectation, support route.

All resolution paths share one behavior: timeline grows, status moves to
*processing*, and the same simulated completion applies.

- **Methods** — destinations with verification status; verifying a card here also
  releases any hold tied to it.
- **Help** — short answers covering pending amounts, estimates, review,
  failures/limits, issue rows, and destination holds.

## Prototype controls

Click the **ND** avatar (top-right) to open the prototype guide — a two-pane
panel: section titles on the left, content canvas on the right. Text sections
show inside the menu canvas; picking a **diagram** (Workflow diagram / State
machine) closes the menu and renders it full-width in the app. Outside clicks
and `Escape` close the menu; walkthrough links jump straight into the app and
close it too.

- **Guide** — *What you're looking at*: pseudonym note and live/simulated
  behavior.
- **Views** — *Guided views* (one-click jumps into the main journey and
  currency switch) and *Exception walkthroughs* (direct links into each
  exception state: earning issue, failed, limit, outdated details, review,
  info request, card hold). Both canvases link to each other.
- **Diagrams** — *Workflow diagram* (earning-to-payout journey as flow steps)
  and *State machine* (payout statuses, every exception branch and its
  resolution path), rendered full-width; each links to the other.
- **Controls** — *Reset demo data* (restores the seeded state) and a demo
  support route.

The menu is keyboard-accessible (`Escape` closes it) and closes after picking
a view.

## Demo script (2–3 minutes)

1. Overview → point out Available vs. pending, more history (paid/available/pending mix).
2. Click an **Available** earning → detail → client/work-period context → **Send payout**.
3. Pick *USD bank account* → notice the live summary strip (fee, arrival, currency).
4. Amount: try **Send all available**, then `500` → **Review payout** → breakdown.
5. **Confirm & send** → modal → **View status** → processing timeline;
   wait for (or click) **Simulate completion** → completion toast + timeline.
6. **Payouts** → `po-8837` (action needed → verify card or change method),
   `po-8819` (under review), `po-8844` (review → info request), `po-8842`
   (outdated details → update form), `po-8846` (daily limit → partial payout).
7. **Earnings** → the *Issue found* row (`e-1046`) → read what's wrong →
   **Resubmit invoice** → earning returns to *pending*.
8. Switch balance to **EUR** via header toggle → EUR earnings + activity.
9. Open a paid earning → **Track payout PO-8831** → completed record with fee breakdown.
10. Alternatively use the **ND menu** walkthrough links and *Reset demo data*.

## Design-system notes

- Currency always paired with amounts; monospace, tabular numerals.
- Status = text + dot + color (not color alone), with `aria` roles.
- Keyboard: nav focus styles, `Enter`/`Space` activates card rows, `Esc` closes modal.
- Semantic tokens for success / pending / warning / error. **Light theme is the default**;
  dark theme is opt-in via `data-theme="dark"` on the `<html>` element.
- Breakpoints: table → cards at 768px, balance grid stacks at 640px, bottom nav on mobile.

## Verification

- `node --check app.js && node --check data.js` for syntax.
- A headless-Chrome click-through exercised the full journey end-to-end
  (67 assertions): overview → setup → review → confirm → track → simulate →
  exception actions → deeper exception paths (update details, info request,
  partial payout, invoice resubmit) → avatar menu behavior → EUR conversion
  paths → validation messages. All pass.
