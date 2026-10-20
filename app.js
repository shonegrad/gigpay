/* ========================================
   GigPay — Application
   ======================================== */

const state = {
  currency: "USD",        // selected balance currency
  screen: "overview",     // current screen
  detailId: null,         // earning detail id
  payoutDraft: null,      // { methodId, payoutCurrency, mode }
  activePayoutId: null,   // payout being tracked
  lastRef: null,          // last created payout ref
  menuView: "guide",      // section shown in the menu canvas
  diagramView: "workflow", // diagram rendered full-width in the main canvas
};

/* ---------- helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const fmt = (n, currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

const fmtPlain = (n) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const AMP = String.fromCharCode(38);
const esc = (s) =>
  String(s)
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/>/g, AMP + "gt;")
    .replace(/"/g, AMP + "quot;")
    .replace(/'/g, AMP + "#39;");

const balanceOf = (c) => DATA.balances.find((b) => b.currency === c);
const earning = (id) => DATA.earnings.find((e) => e.id === id);
const payout = (id) => DATA.payouts.find((p) => p.id === id);
const method = (id) => DATA.methods.find((m) => m.id === id);

const RATES = { "USD->EUR": 0.92, "EUR->USD": 1.08 };
const convert = (amount, from, to) =>
  from === to ? amount : +(amount * RATES[`${from}->${to}`]).toFixed(2);

const S = {
  available: "Available",
  pending: "Pending — collecting",
  paid: "Paid",
  issue: "Issue found",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  review: "Under review",
  "action-needed": "Action needed",
  verified: "Verified",
  "pending-verification": "Verification pending",
};

const badge = (status) =>
  `<span class="status-badge status-${status}">${S[status] || status}</span>`;

const METHOD_ICONS = {
  bank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 10l9-6 9 6"/><path d="M5 10v9"/><path d="M19 10v9"/><path d="M9 10v9"/><path d="M15 10v9"/><path d="M3 19h18"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15.5" r="1"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
};

const timelineHTML = (items) => `
  <ul class="timeline">
    ${items.map((it) => `
      <li class="timeline-item ${it.state}">
        <div class="timeline-date">${esc(it.date)}</div>
        <div class="timeline-title">${esc(it.title)}</div>
        <div class="timeline-description">${esc(it.description)}</div>
      </li>`).join("")}
  </ul>`;

const feeRow = (label, value, cls = "") => `
  <div class="fee-row ${cls}">
    <span class="fee-label">${label}</span>
    <span class="fee-amount ${cls}">${value}</span>
  </div>`;

const otherCurrency = (c) => (c === "USD" ? "EUR" : "USD");

const destSummaryHTML = (methodId, mode) => {
  const m = method(methodId);
  if (!m) {
    return `<span class="text-muted">Select a destination to see its fee, arrival estimate, and verification status.</span>`;
  }
  const target = mode === "convert" ? otherCurrency(state.currency) : state.currency;
  const items = [
    `<strong>${esc(m.name)}</strong>`,
    `Fee: ${esc(m.fee)}`,
    `Arrival: ${esc(m.arrival)}`,
    m.currency === target ? `Keeps ${target}` : `Converts to ${target} (sample rate ${RATES[`${state.currency}->${target}`]})`,
  ];
  return items.join(" · ");
};

/* ---------- toasts ---------- */

function toast(type, title, message) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${esc(title)}</div>
      <div class="toast-message">${esc(message)}</div>
    </div>
    <button class="modal-close" aria-label="Dismiss">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  $("#toast-container").appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ---------- modal ---------- */

const modal = {
  open(title, bodyHTML, actionsHTML = "") {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHTML;
    $("#modal-footer").innerHTML = actionsHTML;
    const overlay = $("#modal-overlay");
    overlay.hidden = false;
    $("#modal-close").focus();
  },
  close() {
    $("#modal-overlay").hidden = true;
  },
};

/* ---------- navigation ---------- */

function setNav(screen) {
  $$(".nav-item").forEach((btn) => {
    const active = btn.dataset.screen === screen;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function go(screen, options = {}) {
  state.screen = screen;
  if (options.detailId !== undefined) state.detailId = options.detailId;
  if (options.payoutId !== undefined) state.activePayoutId = options.payoutId;
  if (options.currency) state.currency = options.currency;
  if (options.payoutDraft !== undefined) state.payoutDraft = options.payoutDraft;
  if (options.view !== undefined) state.diagramView = options.view;

  const main = $("#main-content");
  const renderer = SCREENS[screen] || SCREENS.overview;
  main.innerHTML = `<div class="screen active">${renderer()}</div>`;

  setNav(options.nav !== undefined ? options.nav : mapNav(screen));
  window.scrollTo({ top: 0, behavior: "instant" });
  main.focus({ preventScroll: true });
}

/* =========================================================
   SCREENS
   ========================================================= */

/* the menu lists titles and shows text sections in its canvas; picking a
   diagram closes the menu and renders it full-width in the main canvas */

const DIAGRAM_TITLES = {
  workflow: "Workflow diagram",
  statemachine: "State machine",
};

const diagramSiblings = {
  workflow: "statemachine",
  statemachine: "workflow",
};

const DIAGRAM_CONTENT = {
  workflow() {
    const step = (no, title, description, cls = "") => `
      <div class="dg-step ${cls}">
        <span class="dg-step-no">${no}</span>
        <div class="dg-step-body">
          <strong class="dg-step-title">${title}</strong>
          <small class="dg-step-desc">${description}</small>
        </div>
      </div>`;
    return `
      <div class="diagram">
        <div class="dg-lane">
          <span class="dg-label">Earning</span>
          <div class="dg-steps">
            ${step(1, "Work completed", "Engagement finished on the marketplace")}
            ${step(2, "Invoice sent", "Submitted to the client on the agreed terms")}
            ${step(3, "Client payment collected", "Funds received by the platform for this job")}
            ${step(4, "Funds credited", "Now visible in the Available balance")}
          </div>
        </div>
        <div class="dg-lane">
          <span class="dg-label">Payout</span>
          <div class="dg-steps">
            ${step(5, "Payout initiated", "Pick amount, destination, and currency mode")}
            ${step(6, "Review approved", "Amount, rate, fee, net, and arrival check")}
            ${step(7, "Processing", "Transfer on the way to the destination")}
            ${step(8, "Completed", "Funds arrive — first as an estimate, then confirmed", "dg-ok")}
          </div>
        </div>
        <p class="dg-note">Amounts stay in the Available balance until a payout completes;
          failed transfers return them automatically. Exception branches from
          Processing are shown in the state machine.</p>
      </div>`;
  },
  statemachine() {
    return `
      <div class="diagram">
        <div class="dg-lane">
          <span class="dg-label">Happy path</span>
          <div class="dg-flow">
            <span class="dg-node">Initiated</span>
            <span class="dg-arrow">→</span>
            <span class="dg-node dg-ok">Processing</span>
            <span class="dg-arrow">→</span>
            <span class="dg-node dg-ok">Completed</span>
          </div>
        </div>
        <div class="dg-branches">
          <div class="dg-branch">
            <div class="dg-branch-head">
              <span class="dg-node dg-warn">Under review</span>
              <small class="dg-from">from Processing · routine transfer checks</small>
            </div>
            <p class="dg-branch-note">No action needed unless asked. If the review needs
              something, the payout says exactly what is known, what remains uncertain,
              and the next step.</p>
            <div class="dg-flow">
              <span class="dg-node">info requested?</span>
              <span class="dg-arrow">→</span>
              <span class="dg-node">provide the info</span>
              <span class="dg-node dg-return">→ Processing</span>
            </div>
          </div>
          <div class="dg-branch">
            <div class="dg-branch-head">
              <span class="dg-node dg-err">Failed</span>
              <small class="dg-from">from Processing · bank rejection or daily receiving limit</small>
            </div>
            <p class="dg-branch-note">The amount returns to the Available balance automatically.
              Partial payout sends only what the destination can receive today.</p>
            <div class="dg-flow">
              <span class="dg-node">retry payout</span>
              <span class="dg-node">change method</span>
              <span class="dg-node">partial payout</span>
              <span class="dg-node dg-return">→ Processing</span>
            </div>
          </div>
          <div class="dg-branch">
            <div class="dg-branch-head">
              <span class="dg-node dg-err">Action needed</span>
              <small class="dg-from">from Processing · unverified card or outdated destination details</small>
            </div>
            <p class="dg-branch-note">The interface asks for one specific next step at a time,
              with the fix described in plain language.</p>
            <div class="dg-flow">
              <span class="dg-node">verify card</span>
              <span class="dg-node">update details</span>
              <span class="dg-node dg-return">→ Processing</span>
            </div>
          </div>
        </div>
        <div class="dg-legend">
          <span class="dg-node dg-ok">Processing · Completed</span>
          <small>stable transfer states</small>
          <span class="dg-node dg-warn">Under review</span>
          <small>paused, inspect before acting</small>
          <span class="dg-node dg-err">Failed · Action needed</span>
          <small>blocked — a next step is offered</small>
        </div>
        <p class="dg-note">Every non-completed state names what is known, what remains
          uncertain, and the next step — the same pattern the interface follows.</p>
      </div>`;
  },
};

const SCREENS = {

  /* ---------------- Diagram (menu title target, full-width) ---------------- */
  "diagram"() {
    const view = DIAGRAM_CONTENT[state.diagramView] ? state.diagramView : "workflow";
    const siblingId = diagramSiblings[view];
    return `
      <div class="page-header">
        <div class="page-header-text">
          <h1>Prototype guide</h1>
          <p>${esc(DIAGRAM_TITLES[view])}</p>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <nav class="menu-group-nav" aria-label="More in Diagrams">
            <span class="menu-group-nav-label">Diagrams</span>
            <button class="menu-group-link" data-diagram-view="${siblingId}">${esc(DIAGRAM_TITLES[siblingId])}</button>
          </nav>
          ${DIAGRAM_CONTENT[view]()}
        </div>
      </div>`;
  },

  /* ---------------- Earnings overview ---------------- */
  overview() {
    const cur = state.currency;
    const b = balanceOf(cur);
    const list = DATA.earnings.filter((e) => e.currency === cur);

    const cards = DATA.balances.map((bal) => `
      <button class="balance-card ${bal.currency === cur ? "balance-selected" : ""}"
              data-balance="${bal.currency}"
              aria-pressed="${bal.currency === cur}">
        <div class="balance-card-header">
          <span class="balance-label">${bal.currency} — ${esc(bal.currencyName)}</span>
          ${bal.currency === cur ? '<span class="status-badge status-processing">Viewing</span>' : ""}
        </div>
        <div class="balance-amount">${fmt(bal.available, bal.currency)}</div>
        <div class="balance-subtext">
          <span>Available</span>
          ${bal.pending > 0 ? `<span>·</span><span>${fmt(bal.pending, bal.currency)} pending</span>` : `<span>·</span><span>Nothing pending</span>`}
        </div>
      </button>`).join("");

    const rows = list.map((e) => `
      <tr>
        <td>
          <a href="#" class="table-link" data-earning="${e.id}">${esc(e.title)}</a>
          <div class="text-muted amount-sm">${esc(e.client)} · ${esc(e.workPeriod)}</div>
        </td>
        <td>${badge(e.status)}</td>
        <td>${esc(e.timeline[e.timeline.length - 1].date)}</td>
        <td class="amount amount-neutral" style="text-align:right">${fmt(e.amount, e.currency)}</td>
        <td style="text-align:right">
          ${e.status === "available"
            ? `<button class="btn btn-secondary btn-sm" data-start-payout="${e.id}">Send</button>`
            : ""}
        </td>
      </tr>`).join("");

    return `
      <div class="page-header">
        <div class="page-header-text">
          <h1>Earnings</h1>
          <p>Balances grouped by currency, and what each amount came from.</p>
        </div>
        <button class="btn btn-primary" data-go="payout-start"
                ${b.available <= 0 ? "disabled" : ""}>
          Send payout
        </button>
      </div>

      <div class="balance-summary" role="group" aria-label="Currency balances">${cards}</div>

      <section class="section">
        <h2 class="section-title">Recent activity</h2>
        <div class="card">
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Earning</th><th>Status</th><th>Last event</th><th style="text-align:right">Amount</th><th><span class="visually-hidden">Actions</span></th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="mobile-rows" aria-label="Recent activity">
            ${list.map((e) => `
              <div class="earning-row" data-earning="${e.id}" role="button" tabindex="0"
                   aria-label="${esc(e.title)}, ${esc(e.status)}, ${fmt(e.amount, e.currency)}">
                <div class="earning-top">
                  <div>
                    <div class="earning-title">${esc(e.title)}</div>
                    <div class="earning-sub">${esc(e.client)} · ${esc(e.workPeriod)}</div>
                  </div>
                  <span class="earning-amt">${fmt(e.amount, e.currency)}</span>
                </div>
                <div class="earning-top">
                  ${badge(e.status)}
                  <span class="earning-sub">${esc(e.timeline[e.timeline.length - 1].date)}</span>
                </div>
                ${e.status === "available"
                  ? `<div class="earning-actions"><button class="btn btn-secondary btn-sm" data-start-payout="${e.id}">Send</button></div>`
                  : ""}
              </div>`).join("")}
          </div>
        </div>
        <p class="form-hint mt-2">“Pending” amounts are still being collected from the client. Only <strong>available</strong> amounts can be sent. Rows marked <strong>Issue found</strong> need action before payment can resume.</p>
      </section>`;
  },

  /* ---------------- Earning detail ---------------- */
  "earning-detail"() {
    const e = earning(state.detailId);
    if (!e) return SCREENS.overview();
    const last = e.timeline[e.timeline.length - 1];
    return `
      <button class="btn btn-ghost back-btn" data-go="overview" data-nav="overview">
        ← Back to earnings
      </button>

      <div class="page-header">
        <div class="page-header-text">
          <h1>${esc(e.title)}</h1>
          <p>${esc(e.source)} · ${esc(e.client)}</p>
        </div>
        ${badge(e.status)}
      </div>

      <div class="detail-grid">
        <div class="card">
          <div class="card-header"><h2>Amount</h2></div>
          <div class="card-body">
            <div class="amount-xl">${fmt(e.amount, e.currency)}</div>
            <dl class="detail-list mt-4">
              <div class="detail-row"><dt>Currency</dt><dd>${e.currency}</dd></div>
              <div class="detail-row"><dt>Work period</dt><dd>${esc(e.workPeriod)}</dd></div>
              <div class="detail-row"><dt>Hours / units</dt><dd>${esc(e.hoursOrUnits)}</dd></div>
              <div class="detail-row"><dt>Placement</dt><dd>${esc(e.placement)}</dd></div>
              <div class="detail-row"><dt>Client</dt><dd>${esc(e.client)}</dd></div>
              <div class="detail-row"><dt>Last event</dt><dd>${esc(last.date)}</dd></div>
            </dl>
            ${e.status === "available"
              ? `<button class="btn btn-primary mt-4 w-full" data-start-payout="${e.id}">Send payout of ${fmt(e.amount, e.currency)}</button>`
              : e.status === "issue"
                ? `<div class="callout callout-error mt-4">
                    <strong>What to do next:</strong> ${esc(e.issue)}
                    <div class="mt-3">
                      <button class="btn btn-primary btn-sm" data-resubmit-invoice="${e.id}">Resubmit invoice (fixed)</button>
                      <button class="btn btn-secondary btn-sm" data-contact-support>Contact support</button>
                    </div>
                  </div>`
                : e.payoutRef
                  ? `<p class="form-hint mt-4">${esc(e.detail)}</p>
                     <button class="btn btn-secondary mt-4 w-full" data-open-payout="${e.payoutRef}">Track payout ${esc(e.payoutRef.toUpperCase())}</button>`
                  : `<p class="form-hint mt-4">${esc(e.detail)}</p>`}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>History</h2></div>
          <div class="card-body">
            ${e.timeline.map((it, i) => `
              <div class="earning-detail-item mb-3">
                <span class="earning-detail-label">${esc(it.date)}</span>
                <strong class="earning-detail-value">${esc(it.title)}</strong>
                <span class="text-secondary amount-sm">${esc(it.description)}</span>
              </div>`).join("")}
          </div>
        </div>
      </div>`;
  },

  /* ---------------- Payout setup (destination & currency) ---------------- */
  "payout-start"() {
    const bal = balanceOf(state.currency);
    const max = bal.available;
    const methodsHere = DATA.methods;

    const destCards = methodsHere.map((m) => `
      <label class="selector-card ${state.payoutDraft?.methodId === m.id ? "selected" : ""}">
        <input type="radio" name="dest" value="${m.id}" data-pick-method
               ${state.payoutDraft?.methodId === m.id ? "checked" : ""}>
        <span class="selector-icon">${METHOD_ICONS[m.type]}</span>
        <span class="selector-name">${esc(m.name)} ${badge(m.verification)}</span>
        <span class="selector-detail">${esc(m.detail)} · ${esc(m.arrival)}</span>
        <span class="selector-detail">Fee: ${esc(m.fee)}</span>
      </label>`).join("");

    return `
      <button class="btn btn-ghost back-btn" data-go="overview" data-nav="overview">← Back</button>
      <div class="page-header">
        <div class="page-header-text">
          <h1>Send payout</h1>
          <p>Step 1 of 2 — pick the destination and currency. Available: <strong class="amount">${fmt(max, state.currency)}</strong></p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h2 class="section-title">Destination</h2>
          <div class="selector-grid" role="radiogroup" aria-label="Payout destination">${destCards}</div>
          <div id="dest-summary" class="dest-summary" aria-live="polite">
            ${destSummaryHTML(state.payoutDraft?.methodId, state.payoutDraft?.mode)}
          </div>

          <div class="divider"></div>

          <h2 class="section-title">Currency on arrival</h2>
          <div class="radio-group" role="radiogroup" aria-label="Currency choice">
            <label class="radio-option">
              <input type="radio" name="curmode" value="keep"
                     data-pick-mode ${!state.payoutDraft || state.payoutDraft.mode === "keep" ? "checked" : ""}>
              <span class="radio-indicator"></span>
              <span class="radio-content">
                <span class="radio-title">Keep ${state.currency}</span>
                <span class="radio-description">Send as-is to a ${state.currency}-capable destination.</span>
              </span>
            </label>
            <label class="radio-option">
              <input type="radio" name="curmode" value="convert"
                     data-pick-mode ${state.payoutDraft?.mode === "convert" ? "checked" : ""}>
              <span class="radio-indicator"></span>
              <span class="radio-content">
                <span class="radio-title">Convert ${state.currency} → ${state.currency === "USD" ? "EUR" : "USD"}</span>
                <span class="radio-description">Sample rate: 1 ${state.currency} = ${RATES[`${state.currency}->${state.currency === "USD" ? "EUR" : "USD"}`]} ${state.currency === "USD" ? "EUR" : "USD"}. Final rate is locked at confirmation time.</span>
              </span>
            </label>
          </div>

          <div class="form-group mt-6">
            <div class="flex items-center justify-between gap-2">
              <label class="form-label" for="amount">Amount (${state.currency})</label>
              <button type="button" class="btn btn-ghost btn-sm" id="send-all">Send all available</button>
            </div>
            <input class="form-input" id="amount" type="number" min="10" max="${max}" step="0.01"
                   placeholder="e.g. 500.00" value="${state.payoutDraft?.amount != null ? state.payoutDraft.amount : ""}">
            <p class="form-hint">Between 10.00 and ${fmtPlain(max)} ${state.currency}. The fee is taken from this amount.</p>
            <p class="form-error" data-amount-error hidden></p>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-secondary" data-go="overview" data-nav="overview">Cancel</button>
          <button class="btn btn-primary" data-next-review>Review payout</button>
        </div>
      </div>`;
  },

  /* ---------------- Payout review ---------------- */
  "payout-review"() {
    const d = state.payoutDraft;
    if (!d) return SCREENS["payout-start"]();
    const m = method(d.methodId);
    const bal = balanceOf(state.currency);
    const cur = d.payoutCurrency || state.currency;

    const amount = d.amount;
    const fee = m.type === "card" ? +(amount * 0.012).toFixed(2) : m.type === "wallet" ? 0.3 : 1.5;
    const net = +(amount - fee).toFixed(2);
    const converting = cur !== state.currency;
    const rate = converting ? RATES[`${state.currency}->${cur}`] : null;
    const rateTime = converting ? "Dec 21, 2025 · 09:14" : null;
    const netConverted = converting ? convert(net, state.currency, cur) : net;

    /* keep draft results for confirmation step */
    state.payoutDraft.calc = { fee, net, converting, rate, rateTime, netConverted, cur };

    return `
      <button class="btn btn-ghost back-btn" data-go="payout-start" data-nav="payouts">← Change details</button>
      <div class="page-header">
        <div class="page-header-text">
          <h1>Review payout</h1>
          <p>Step 2 of 2 — check the details before money moves.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="fee-breakdown">
            ${feeRow(`Debited from ${state.currency} available balance`, fmt(amount, state.currency))}
            ${converting
              ? feeRow(`Exchange rate <span class="text-muted">(sample · ${esc(rateTime)})</span>`, `${rate} → ${cur}`, "positive")
              : ""}
            ${feeRow("Payout fee (depends on method)", `− ${fmt(fee, state.currency)}`, "negative")}
            <div class="fee-row total">
              <span class="fee-label">You receive</span>
              <span class="fee-amount">${fmt(converting ? netConverted : net, converting ? cur : state.currency)}</span>
            </div>
          </div>

          <dl class="detail-list mt-4">
            <div class="detail-row"><dt>Destination</dt><dd>${esc(m.name)} — ${esc(m.detail)}</dd></div>
            <div class="detail-row"><dt>Debited now</dt><dd class="amount">${fmt(amount, state.currency)}</dd></div>
            <div class="detail-row"><dt>Estimated arrival</dt><dd>${esc(m.arrival)} (estimate, not guaranteed)</dd></div>
            ${converting
              ? `<div class="detail-row"><dt>Rate notice</dt><dd>The final rate is the one locked at the moment you confirm. If it differs by more than a small margin, you'll see it before the payout proceeds.</dd></div>`
              : ""}
          </dl>
        </div>
        <div class="card-footer">
          <button class="btn btn-secondary" data-go="payout-start" data-nav="payouts">Make changes</button>
          <button class="btn btn-primary" data-confirm-payout>Confirm & send</button>
        </div>
      </div>`;
  },

  /* ---------------- Payout tracking ---------------- */
  "payouts"() {
    const list = DATA.payouts;
    const rows = list.map((p) => `
      <tr>
        <td><a href="#" class="table-link" data-open-payout="${p.id}">${esc(p.id)}</a>
            <div class="text-muted amount-sm">${esc(p.created)}</div></td>
        <td>${badge(p.status)}</td>
        <td>${esc(p.destinationLabel)}</td>
        <td class="amount amount-neutral" style="text-align:right">${fmt(p.amount, p.currency)}</td>
      </tr>`).join("");

    const detail = state.activePayoutId
      ? SCREENS["payout-detail"]()
      : `<p class="form-hint">Select a payout to see its timeline.</p>`;

    return `
      <div class="page-header">
        <div class="page-header-text">
          <h1>Payouts</h1>
          <p>History and tracking. Confirmed events and estimates are labeled separately.</p>
        </div>
      </div>
      <div class="detail-grid">
        <div class="card">
          <div class="card-header"><h2>History</h2></div>
          <div class="table-container">
            <table>
              <thead><tr><th>Reference</th><th>Status</th><th>Destination</th><th style="text-align:right">Amount</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Details</h2></div>
          <div class="card-body">${detail}</div>
        </div>
      </div>`;
  },

  /* ---------------- Payout detail panel ---------------- */
  "payout-detail"() {
    const p = payout(state.activePayoutId);
    if (!p) return `<p class="form-hint">Select a payout to see its timeline.</p>`;

    const explain = {
      processing: `The transfer is being processed. Estimated arrival: ${esc(p.estimatedArrival)}. Estimates are not guaranteed dates.`,
      completed: `Completed on ${esc(p.completedOn)}. The payout record stays in your history.`,
      failed: esc(p.reason),
      review: esc(p.reason),
      "action-needed": esc(p.reason),
    }[p.status];

    const actions =
      p.status === "failed" && p.dailyLimit
        ? `<div class="callout callout-error">
            <strong>What happened:</strong> the destination's daily receiving limit was reached. The full amount (${fmt(p.amount, p.currency)}, fee included) returned to your available balance.
            <div class="mt-3">
              <button class="btn btn-primary btn-sm" data-partial-payout="${p.id}">Send partial payout (${fmt(p.dailyLimit, p.currency)})</button>
              <button class="btn btn-secondary btn-sm" data-contact-support>Contact support</button>
            </div>
            <p class="mt-2 amount-sm">Retrying the full amount is suggested for the next business day — the limit resets daily.</p>
          </div>`
        : p.status === "failed"
          ? `<div class="callout callout-error">
              <strong>What happened:</strong> the bank rejected the transfer. The full amount including the fee (${fmt(p.amount, p.currency)}) was returned to your available balance — nothing was lost.
              <div class="mt-3">
                <button class="btn btn-primary btn-sm" data-retry-payout="${p.id}">Retry payout</button>
                <button class="btn btn-secondary btn-sm" data-change-method="${p.id}">Change method</button>
                <button class="btn btn-secondary btn-sm" data-contact-support>Contact support</button>
              </div>
            </div>`
          : p.status === "review" && p.needsInfo
            ? `<div class="callout callout-warning">
                <strong>One step is needed:</strong> the review asked for a short confirmation of the balance source. The payout stays paused until you respond.
                <div class="mt-3">
                  <button class="btn btn-primary btn-sm" data-provide-info="${p.id}">Provide the requested info</button>
                  <button class="btn btn-secondary btn-sm" data-contact-support>Contact support</button>
                </div>
              </div>`
            : p.status === "review"
              ? `<div class="callout callout-warning">
                  <strong>Do I need to do anything?</strong> No — this review is standard. We'll notify you when it completes, usually within 1–2 business days.
                  <div class="mt-3">
                    <button class="btn btn-secondary btn-sm" data-contact-support>Contact support</button>
                  </div>
                </div>`
              : p.status === "action-needed" && p.outdatedDetails
                ? `<div class="callout callout-error">
                    <strong>What to do next:</strong> the receiving account's details are outdated. Update them and the transfer resumes right away, or pick another verified method.
                    <div class="mt-3">
                      <button class="btn btn-primary btn-sm" data-update-details="${p.id}">Update destination details</button>
                      <button class="btn btn-secondary btn-sm" data-change-method="${p.id}">Change method</button>
                    </div>
                  </div>`
                : p.status === "action-needed"
                  ? `<div class="callout callout-error">
                      <strong>What to do next:</strong> verify the debit card with your bank, or change the payout method for this transfer.
                      <div class="mt-3">
                        <button class="btn btn-primary btn-sm" data-verify-card>Verify card</button>
                        <button class="btn btn-secondary btn-sm" data-change-method="${p.id}">Change method</button>
                      </div>
                    </div>`
                  : p.status === "processing"
                    ? `<p class="form-hint">Nothing to do right now. We'll update the status here. Estimated arrival: ${esc(p.estimatedArrival)}.</p>
                       <button class="btn btn-secondary btn-sm mt-2" data-simulate-complete="${p.id}">Simulate completion</button>`
                    : `<p class="form-hint">All done. Reference ${esc(p.id)} is your record of this transfer.</p>`;

    return `
      <div class="mb-4">
        <div class="flex items-center justify-between gap-2" style="align-items:flex-start">
          <div>
            <div class="amount-lg">${fmt(p.amount, p.currency)}</div>
            <div class="text-muted amount-sm">Ref ${esc(p.id)} · ${esc(p.created)}</div>
          </div>
          ${badge(p.status)}
        </div>
      </div>

      <h3 class="section-title">Amount details</h3>
      <div class="fee-breakdown mb-4">
        ${feeRow("Payout amount", fmt(p.amount, p.currency))}
        ${p.rate && (p.rateCache || true) && p.converted && p.netCurrency
          ? feeRow(`Exchange rate <span class="text-muted">(sample)</span>`, `${esc(p.rate)}`, "positive")
          : ""}
        ${feeRow("Payout fee", `− ${fmt(p.fee, p.currency)}`, "negative")}
        <div class="fee-row total">
          <span class="fee-label">You receive${p.converted && p.netCurrency ? " (after conversion)" : ""}</span>
          <span class="fee-amount">${fmt(p.net, p.netCurrency || p.currency)}</span>
        </div>
      </div>

      <h3 class="section-title">Transfer details</h3>
      <dl class="detail-list mb-4">
        <div class="detail-row"><dt>Destination</dt><dd>${esc(p.destinationLabel)}</dd></div>
        <div class="detail-row"><dt>Status</dt><dd>${badge(p.status)}</dd></div>
        ${p.estimatedArrival && p.status !== "completed"
          ? `<div class="detail-row"><dt>Estimated arrival</dt><dd>${esc(p.estimatedArrival)} — estimate, not guaranteed</dd></div>` : ""}
        ${p.completedOn ? `<div class="detail-row"><dt>Completed</dt><dd>${esc(p.completedOn)}</dd></div>` : ""}
      </dl>

      <h3 class="section-title">Timeline</h3>
      ${timelineHTML(p.timeline)}
      <div class="mt-4">${actions}</div>
      <p class="mt-3 text-secondary amount-sm">${explain}</p>
      <div class="mt-4">
        <button class="btn btn-secondary btn-sm" data-contact-support>Contact support about ${esc(p.id)}</button>
      </div>`;
  },
};

/* =========================================================
   HELP + METHODS (secondary screens)
   ========================================================= */

SCREENS.methods = () => `
  <div class="page-header">
    <div class="page-header-text">
      <h1>Payment methods</h1>
      <p>Destinations for your payouts, and their verification status.</p>
    </div>
  </div>
  <div class="selector-grid">
    ${DATA.methods.map((m) => `
      <div class="balance-card">
        <div class="balance-card-header">
          <span class="balance-label">${esc(m.name)}</span>
          ${badge(m.verification)}
        </div>
        <div class="balance-subtext" style="display:block">
          <div>${esc(m.detail)}</div>
          <div class="mt-1 text-secondary">${esc(m.arrival)} · Fee: ${esc(m.fee)}</div>
          ${m.verification === "pending-verification"
            ? `<div class="mt-2"><button class="btn btn-secondary btn-sm" data-verify-card>Verify card</button></div>`
            : ""}
        </div>
      </div>`).join("")}
  </div>`;

SCREENS.help = () => `
  <div class="page-header">
    <div class="page-header-text">
      <h1>Help</h1>
      <p>Short answers for the questions this product is designed to resolve.</p>
    </div>
  </div>
  <div class="card">
    <div class="card-body">
      ${[
        ["Why is some of my money “pending”?", "Pending amounts relate to work completed but not yet collected from the client. They become available after collection."],
        ["When is an arrival date guaranteed?", "Dates labeled “estimate” are not guaranteed. Confirmed dates appear on the timeline once an event has happened."],
        ["What does “under review” mean?", "A standard compliance check on a transfer. It usually completes in 1–2 business days and needs no action from you. If the review needs information, the payout pauses and the detail view tells you exactly what to provide."],
        ["A payout failed — did I lose money?", "No. Failed transfers return the full amount, including fees, to your available balance. From there you can retry, change the method, or — if a daily limit at the destination was reached — send a partial amount."],
        ["What does “issue found” on an earning mean?", "The client questioned part of the invoice (e.g. wrong task codes). The earning detail explains which lines were affected and what to fix, and offers a resubmit path. Collection resumes after resubmission."],
        ["Why did my destination stop accepting transfers?", "Most often the account details changed or the card is not verified. The payout holds the funds in your available balance and the action panel covers updating details, verifying, or switching destinations."],
      ].map(([q, a]) => `
        <div class="mb-4">
          <h3 class="earning-detail-value">${esc(q)}</h3>
          <p class="text-secondary amount-sm">${esc(a)}</p>
        </div>`).join("")}
      <button class="btn btn-primary" data-contact-support>Contact support</button>
    </div>
  </div>`;

/* =========================================================
   SIMULATED PAYOUT PROGRESSION (demo)
   New payouts auto-advance processing → completed after a
   short delay; a manual control exists in the detail panel.
   ========================================================= */

const payoutTimers = new Set();

function advancePayout(p) {
  if (!p || p.status !== "processing") return;
  payoutTimers.add(p.id);
  p.status = "completed";
  p.completedOn = "Just now";
  const destName = p.destinationLabel.split(" — ")[0];
  p.timeline = p.timeline.map((ev) => (ev.state === "current" ? { ...ev, state: "completed" } : ev));
  p.timeline.push({
    date: "Just now",
    title: "Completed",
    description: `${fmt(p.net, p.netCurrency || p.currency)} received by ${destName}.`,
    state: "completed",
  });
  const b = balanceOf(p.netCurrency || p.currency);
  if (b) b.paid = +(b.paid + p.net).toFixed(2);
  toast("success", `Payout ${p.id} completed`, `${fmt(p.net, p.netCurrency || p.currency)} delivered to ${destName}.`);
  if (state.screen === "payouts") go("payouts", { payoutId: p.id });
}

function scheduleCompletion(p, delay = 9000) {
  if (!p || p.status !== "processing" || payoutTimers.has(p.id)) return;
  payoutTimers.add(p.id);
  setTimeout(() => {
    payoutTimers.delete(p.id);
    advancePayout(p);
  }, delay);
}

/* Resolve a hold (issue found / info request / outdated details): moves the
   payout back to processing with a new timeline event and schedules completion. */
function resolveHold(p, title, description, autoDelay = 7000) {
  if (!p) return;
  p.timeline = p.timeline.map((ev) => (ev.state === "current" ? { ...ev, state: "completed" } : ev));
  p.timeline.push({ date: "Just now", title, description, state: "current" });
  p.status = "processing";
  p.estimatedArrival = method(p.destination)?.arrival || p.estimatedArrival || "1–2 business days after processing";
  p.reason = null;
  go("payouts", { payoutId: p.id });
  scheduleCompletion(p, autoDelay);
}

/* =========================================================
   EVENTS
   ========================================================= */

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go],[data-balance],[data-earning],[data-start-payout],[data-pick-method],[data-pick-mode],[data-next-review],[data-confirm-payout],[data-open-payout],[data-retry-payout],[data-contact-support],[data-verify-card],[data-change-method],[data-simulate-complete],[data-resubmit-invoice],[data-update-details],[data-provide-info],[data-partial-payout],[data-reset-demo],[data-diagram-view],#send-all,.table-link,button.nav-item,.modal-close");
  if (!t) return;

  if (t.classList.contains("modal-close") && t.closest(".toast")) {
    t.closest(".toast").remove();
    return;
  }
  if (t.id === "modal-close" || t.closest(".modal-close")) { modal.close(); return; }

  if (t.dataset.balance) {
    go("overview", { currency: t.dataset.balance });
    return;
  }
  if (t.dataset.diagramView) {
    state.menuView = t.dataset.diagramView;
    go("diagram", { view: t.dataset.diagramView });
    return;
  }
  if (t.dataset.go) {
    go(t.dataset.go, { nav: t.dataset.nav || mapNav(t.dataset.go) });
    return;
  }
  if (t.dataset.earning) {
    go("earning-detail", { detailId: t.dataset.earning, nav: "overview" });
    return;
  }
  if (t.dataset.startPayout) {
    const earn = earning(t.dataset.startPayout);
    go("payout-start", { nav: "payouts", currency: earn.currency, payoutDraft: null });
    return;
  }
  if (t.dataset.pickMethod !== undefined) {
    const id = t.value;
    state.payoutDraft = { ...(state.payoutDraft || {}), methodId: id };
    $$("[data-pick-method]").forEach((el) => el.closest(".selector-card").classList.toggle("selected", el.value === id));
    const sum = $("#dest-summary");
    if (sum) sum.innerHTML = destSummaryHTML(id, state.payoutDraft?.mode);
    return;
  }
  if (t.dataset.pickMode !== undefined) {
    const mode = t.value;
    state.payoutDraft = { ...(state.payoutDraft || {}), mode };
    const sum = $("#dest-summary");
    if (sum) sum.innerHTML = destSummaryHTML(state.payoutDraft?.methodId, mode);
    return;
  }
  if (t.id === "send-all") {
    const inp = $("#amount");
    if (inp) {
      inp.value = balanceOf(state.currency).available;
      inp.focus();
    }
    return;
  }
  if (t.dataset.nextReview === "" || t.hasAttribute("data-next-review")) {
    const amount = parseFloat($("#amount")?.value);
    const m = method(state.payoutDraft?.methodId);
    if (!m) { toast("warning", "Pick a destination", "Choose where the payout should go."); return; }
    const err = $("[data-amount-error]");
    if (!amount) {
      err.textContent = "Enter an amount first.";
      err.hidden = false;
      return;
    }
    if (amount < 10) {
      err.textContent = "The minimum payout amount is 10.00 " + state.currency + ".";
      err.hidden = false;
      return;
    }
    if (amount > balanceOf(state.currency).available) {
      err.textContent = "That's more than your available balance of " + fmt(balanceOf(state.currency).available, state.currency) + ".";
      err.hidden = false;
      return;
    }
    if (err) err.hidden = true;
    state.payoutDraft.amount = amount;
    state.payoutDraft.payoutCurrency =
      state.payoutDraft.mode === "convert"
        ? (state.currency === "USD" ? "EUR" : "USD")
        : state.currency;
    go("payout-review");
    return;
  }
  if (t.hasAttribute("data-confirm-payout")) {
    const d = state.payoutDraft;
    const ref = "PO-" + Math.floor(8900 + Math.random() * 90);
    state.lastRef = ref;
    const m = method(d.methodId);

    /* deduct from the available balance */
    const bal = balanceOf(state.currency);
    bal.available = +(bal.available - d.amount).toFixed(2);
    bal.paid = +(bal.paid + d.amount).toFixed(2);

    /* create a trackable payout record */
    DATA.payouts.unshift({
      id: ref,
      created: "Just now",
      amount: d.amount,
      currency: state.currency,
      destination: d.methodId,
      destinationLabel: `${m.name} — ${m.detail}`,
      status: "processing",
      net: d.calc.converting ? d.calc.netConverted : d.calc.net,
      netCurrency: d.calc.converting ? d.calc.cur : state.currency,
      fee: d.calc.fee,
      rate: d.calc.converting ? `1 ${state.currency} = ${RATES[`${state.currency}->${d.calc.cur}`]} ${d.calc.cur}` : null,
      converted: d.calc.converting,
      estimatedArrival: m.arrival,
      timeline: [
        { date: "Just now", title: "Payout initiated", description: `${ref} created from your available balance.`, state: "completed" },
        { date: "Just now", title: "Processing", description: "The transfer is being processed.", state: "current" },
        { date: `Est. ${m.arrival}`, title: "Expected completion", description: "Estimate based on the destination. Not a guaranteed date.", state: "pending" },
      ],
    });
    scheduleCompletion(DATA.payouts[0]);

    modal.open(
      "Payout confirmed",
      `
      <div class="confirmation-summary">
        <div class="confirmation-row"><span>Reference</span><strong>${ref}</strong></div>
        <div class="confirmation-row"><span>Debited</span><span class="amount">${fmt(d.amount, state.currency)}</span></div>
        ${d.calc.converting
          ? `<div class="confirmation-row"><span>Rate locked now</span><span class="amount">1 ${state.currency} = ${RATES[`${state.currency}->${d.calc.cur}`]} ${d.calc.cur}</span></div>`
          : ""}
        <div class="confirmation-row"><span>Fee</span><span class="amount">− ${fmt(d.calc.fee, state.currency)}</span></div>
        <div class="confirmation-row total">
          <span>You receive</span>
          <span class="amount">${fmt(d.calc.converting ? d.calc.netConverted : d.calc.net, d.calc.converting ? d.calc.cur : state.currency)}</span>
        </div>
        <div class="confirmation-row"><span>Destination</span><span>${esc(m.name)}</span></div>
        <div class="confirmation-row"><span>Track it</span><span>Payouts → ${ref}</span></div>
      </div>`,
      `<button class="btn btn-secondary" data-modal-close>Close</button>
       <button class="btn btn-primary" id="view-payout-now">View status</button>`
    );

    $("#view-payout-now").addEventListener("click", () => {
      modal.close();
      go("payouts", { payoutId: ref });
    });
    $('[data-modal-close]').addEventListener("click", modal.close);
    return;
  }
  if (t.dataset.openPayout) {
    go("payouts", { payoutId: t.dataset.openPayout });
    return;
  }
  if (t.dataset.simulateComplete || t.hasAttribute("data-simulate-complete")) {
    advancePayout(payout(t.dataset.simulateComplete));
    return;
  }
  if (t.hasAttribute("data-reset-demo")) {
    closeAvatarMenu();
    location.reload();
    return;
  }
  if (t.dataset.retryPayout) {
    const failed = payout(t.dataset.retryPayout);
    if (failed) {
      const ref = "PO-" + Math.floor(8900 + Math.random() * 90);
      const m = method(failed.destination);
      const rec = {
        id: ref,
        created: "Just now",
        amount: failed.amount,
        currency: failed.currency,
        destination: failed.destination,
        destinationLabel: failed.destinationLabel,
        status: "processing",
        net: failed.net,
        netCurrency: failed.netCurrency,
        fee: failed.fee,
        rate: failed.rate,
        converted: failed.converted,
        estimatedArrival: m ? m.arrival : "1–2 business days after processing",
        timeline: [
          { date: "Just now", title: "Payout initiated", description: `${ref} created as a retry of ${failed.id}.`, state: "completed" },
          { date: "Just now", title: "Processing", description: "The transfer is being processed.", state: "current" },
          { date: `Est. ${m ? m.arrival : "in a few business days"}`, title: "Expected completion", description: "Estimate based on the destination. Not a guaranteed date.", state: "pending" },
        ],
      };
      DATA.payouts.unshift(rec);
      failed.timeline.push({
        date: "Just now",
        title: "Retry sent",
        description: `${ref} was created to attempt the transfer again.`,
        state: "completed",
      });
      scheduleCompletion(rec);
      toast("success", `Retry created — ${ref}`, "The new transfer is processing. The original record stays in your history.");
      go("payouts", { payoutId: ref });
    }
    return;
  }
  if (t.hasAttribute("data-contact-support")) {
    modal.open(
      "Contact support",
      `<p class="text-secondary">In this prototype, support is represented by a help route. Reference numbers, timelines and status explanations are designed to reduce the need for it.</p>
       <div class="confirmation-warning mt-4">
         <div class="confirmation-warning-text">Have your payout reference ready — e.g. ${esc(state.activePayoutId || "PO-8834")} — to speed up the conversation.</div>
       </div>`,
      `<button class="btn btn-primary" data-modal-close>Got it</button>`
    );
    $('[data-modal-close]').addEventListener("click", modal.close);
    return;
  }
  if (t.hasAttribute("data-verify-card")) {
    const card = method("m-4");
    card.verification = "verified";
    const held = DATA.payouts.find((x) => x.status === "action-needed" && x.destination === "m-4");
    if (held) {
      held.timeline = held.timeline.map((ev) => (ev.state === "current" ? { ...ev, state: "completed" } : ev));
      held.status = "processing";
      held.estimatedArrival = card.arrival;
      held.reason = null;
      held.timeline.push({
        date: "Just now",
        title: "Card verified",
        description: "3-D Secure verification completed. The transfer moved to processing.",
        state: "current",
      });
      if (state.screen === "payouts") go("payouts", { payoutId: held.id });
      scheduleCompletion(held);
      toast("success", "Card verified", `${held.id} resumed processing — the funds stay available until it completes.`);
    } else {
      toast("success", "Card verified", "The debit card can now receive payouts.");
    }
    if (state.screen === "methods") go("methods");
    return;
  }
  if (t.dataset.resubmitInvoice) {
    const e2 = earning(t.dataset.resubmitInvoice);
    if (e2) {
      e2.status = "pending";
      e2.issue = null;
      e2.detail = "Corrected invoice resubmitted. Estimated collect by Jan 2, 2026.";
      e2.timeline = e2.timeline.map((ev) => (ev.state === "current" ? { ...ev, state: "completed" } : ev));
      e2.timeline.push({
        date: "Just now",
        title: "Invoice resubmitted",
        description: "Corrected line items sent to Retail Co. Collection resumes. Estimated collect Jan 2, 2026 — estimate, not a confirmed date.",
        state: "current",
      });
      toast("success", "Invoice resubmitted", "Corrected line items sent. Collection resumes with a new estimate.");
      go("earning-detail", { detailId: e2.id });
    }
    return;
  }
  if (t.dataset.updateDetails) {
    const pr = payout(t.dataset.updateDetails);
    if (!pr) return;
    const m = method(pr.destination);
    modal.open(
      `Update destination details — ${pr.id}`,
      `<p class="text-secondary amount-sm" style="margin-bottom:16px">The bank flagged outdated account details. Re-enter the current ones (simulated form) to resume the transfer.</p>
       <div class="form-group">
         <label class="form-label" for="dd-holder">Account holder</label>
         <input class="form-input" id="dd-holder" value="${esc(DATA.worker.name)}">
       </div>
       <div class="form-group">
         <label class="form-label" for="dd-bank">Bank</label>
         <input class="form-input" id="dd-bank" value="${esc(m ? m.detail.split(" ••••")[0] : "Silvergate Bank")}">
       </div>
       <div class="form-group">
         <label class="form-label" for="dd-account">Account number</label>
         <input class="form-input" id="dd-account" placeholder="•••• enter full account number" inputmode="numeric">
         <p class="form-hint">In production this re-runs the destination verification. Fields are pretend in this prototype.</p>
         <p class="form-error" data-dd-error hidden>Enter an account number to continue.</p>
       </div>`,
      `<button class="btn btn-secondary" data-modal-close2>Cancel</button>
       <button class="btn btn-primary" id="dd-save">Save & resume transfer</button>`
    );
    $("[data-modal-close2]").addEventListener("click", modal.close);
    $("#dd-save").addEventListener("click", () => {
      const acct = $("#dd-account").value.trim();
      if (!acct) { const err = $("[data-dd-error]"); if (err) err.hidden = false; return; }
      if (m) m.detail = `${m.detail.split(" ••••")[0]} •••• ${acct.slice(-4).padStart(4, "•")}`;
      const label = pr.destinationLabel.split(" — ")[0];
      pr.destinationLabel = `${label}${m ? " — " + m.detail : ""}`;
      resolveHold(
        pr,
        "Destination updated",
        `New account details saved and re-approved. The transfer resumed processing to ${esc(m ? m.detail : label)}.`
      );
      modal.close();
      toast("success", "Details updated", `${pr.id} resumed processing.`);
    });
    return;
  }
  if (t.dataset.provideInfo) {
    const pr = payout(t.dataset.provideInfo);
    if (!pr) return;
    modal.open(
      `Information requested — ${pr.id}`,
      `<p class="text-secondary amount-sm" style="margin-bottom:16px">Confirm that this balance comes from marketplace work. A short note is enough in this prototype (in production this is a document upload).</p>
       <div class="form-group">
         <label class="form-label" for="pi-note">Confirmation</label>
         <textarea class="form-input" id="pi-note" rows="3" placeholder="e.g. All amounts were earned through GigCX Marketplace placements (customer experience work).">All amounts were earned through GigCX Marketplace customer-experience placements.</textarea>
       </div>`,
      `<button class="btn btn-secondary" data-modal-close2>Cancel</button>
       <button class="btn btn-primary" id="pi-submit">Submit & resume</button>`
    );
    $("[data-modal-close2]").addEventListener("click", modal.close);
    $("#pi-submit").addEventListener("click", () => {
      resolveHold(
        pr,
        "Info provided",
        "Source confirmation submitted. The review cleared and the payout resumed processing."
      );
      modal.close();
      toast("success", "Info submitted", `${pr.id} cleared review and resumed processing.`);
    });
    return;
  }
  if (t.dataset.partialPayout) {
    const failed = payout(t.dataset.partialPayout);
    if (!failed) return;
    const limit = failed.dailyLimit || 250;
    const m = method(failed.destination);
    const ref2 = "PO-" + Math.floor(8900 + Math.random() * 90);
    const bal = balanceOf("USD");
    bal.available = +(bal.available - limit).toFixed(2);
    bal.paid = +(bal.paid + limit).toFixed(2);
    const rec = {
      id: ref2,
      created: "Just now",
      amount: limit,
      currency: "USD",
      destination: failed.destination,
      destinationLabel: failed.destinationLabel,
      status: "processing",
      net: +(limit - failed.fee).toFixed(2),
      fee: failed.fee,
      rate: null,
      estimatedArrival: m ? m.arrival : "1–2 business days after processing",
      timeline: [
        { date: "Just now", title: "Payout initiated", description: `${ref2} created as a partial payout of ${failed.id} — within today's remaining limit.`, state: "completed" },
        { date: "Just now", title: "Processing", description: "The transfer is being processed.", state: "current" },
        { date: `Est. ${m ? m.arrival : "in a few business days"}`, title: "Expected completion", description: "Estimate based on the destination. Not a guaranteed date.", state: "pending" },
      ],
    };
    DATA.payouts.unshift(rec);
    failed.timeline.push({
      date: "Just now",
      title: "Partial payout sent",
      description: `${limit.toFixed(2)} USD is being retried as ${ref2}. The remaining amount can be sent after the daily limit resets.`,
      state: "completed",
    });
    scheduleCompletion(rec, 5000);
    go("payouts", { payoutId: ref2 });
    toast("info", "Partial payout started", `${fmt(limit, "USD")} is processing as ${ref2}. Send the rest after the limit resets.`);
    return;
  }
  if (t.dataset.changeMethod) {
    const p = payout(t.dataset.changeMethod);
    if (!p) return;
    const options = DATA.methods.filter((m) => m.currency === p.currency && m.verification === "verified" && m.id !== p.destination);
    if (!options.length) {
      toast("warning", "No verified alternatives", "Verify another destination in Payment methods first.");
      return;
    }
    modal.open(
      `Change method for ${p.id}`,
      `<p class="text-secondary amount-sm" style="margin-bottom:16px">The transfer is on hold because the original destination is unverified. Pick another verified destination.</p>
       <div class="selector-grid" style="grid-template-columns:1fr">
         ${options.map((m) => `
           <button class="selector-card" data-pick-change="${m.id}" data-change-ref="${p.id}">
             <span class="selector-icon">${METHOD_ICONS[m.type]}</span>
             <span class="selector-name">${esc(m.name)}</span>
             <span class="selector-detail">${esc(m.detail)} · ${esc(m.arrival)}</span>
             <span class="selector-detail">Fee: ${esc(m.fee)}</span>
           </button>`).join("")}
       </div>`,
      `<button class="btn btn-secondary" data-modal-close2>Keep as is</button>`
    );
    $("[data-modal-close2]").addEventListener("click", modal.close);
    $$("[data-pick-change]").forEach((btn) => btn.addEventListener("click", () => {
      const m = method(btn.dataset.pickChange);
      const pr = payout(btn.dataset.changeRef);
      pr.destination = m.id;
      pr.destinationLabel = `${m.name} — ${m.detail}`;
      pr.status = "processing";
      pr.estimatedArrival = m.arrival;
      /* recompute fee for the new method */
      pr.fee = m.type === "card" ? +(pr.amount * 0.012).toFixed(2) : m.type === "wallet" ? 0.3 : 1.5;
      pr.net = +(pr.amount - pr.fee).toFixed(2);
      pr.timeline.push({
        date: "Just now",
        title: "Method changed",
        description: `Destination switched to ${m.name}. The transfer moved to processing.`,
        state: "current",
      });
      modal.close();
      go("payouts", { payoutId: pr.id });
      scheduleCompletion(pr);
      toast("success", "Method updated", `${pr.id} is now processing to ${m.name}.`);
    }));
    return;
  }
}, false);

function mapNav(screenId) {
  if (["overview", "earning-detail"].includes(screenId)) return "overview";
  if (["payouts", "payout-detail", "payout-start", "payout-review"].includes(screenId)) return "payouts";
  return screenId;
}

/* nav buttons */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button.nav-item");
  if (!btn) return;
  go(btn.dataset.screen);
});

/* ---------- avatar menu (prototype guide & controls) ---------- */

/* shows the selected section in the menu canvas */
const showMenuView = (id) => {
  const menu = $("#avatar-menu");
  menu.querySelectorAll(".menu-nav-item").forEach((item) => {
    const on = item.dataset.menuView === id;
    item.classList.toggle("active", on);
    if (on) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
  menu.querySelectorAll(".menu-view").forEach((view) => {
    view.hidden = view.dataset.menuCanvas !== id;
  });
};

const openAvatarMenu = () => {
  const menu = $("#avatar-menu");
  showMenuView(state.menuView || "guide");
  menu.hidden = false;
  $("#avatar-btn").setAttribute("aria-expanded", "true");
};

const closeAvatarMenu = () => {
  const menu = $("#avatar-menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $("#avatar-btn").setAttribute("aria-expanded", "false");
};

$("#avatar-btn").addEventListener("click", () => {
  const menu = $("#avatar-menu");
  menu.hidden ? openAvatarMenu() : closeAvatarMenu();
});

/* close when clicking anything outside the menu+button */
document.addEventListener("click", (e) => {
  if (!e.target.closest("#avatar-menu") && !e.target.closest("#avatar-btn")) closeAvatarMenu();
}, true);

/* text sections show in the menu canvas; diagrams close the menu and render
   full-width in the app; walkthrough links jump straight into the app */
$("#avatar-menu").addEventListener("click", (e) => {
  const title = e.target.closest("[data-menu-view]");
  if (title) {
    const id = title.dataset.menuView;
    state.menuView = id;
    if (id === "workflow" || id === "statemachine") {
      closeAvatarMenu();
      go("diagram", { view: id });
      return;
    }
    showMenuView(id);
    return;
  }
  if (e.target.closest(".avatar-links a")) closeAvatarMenu();
});

/* balance switch via header */
$("#currency-toggle").addEventListener("click", () => {
  const order = ["USD", "EUR"];
  const next = order[(order.indexOf(state.currency) + 1) % order.length];
  $("#current-currency").textContent = next;
  go("overview", { currency: next });
});

$("#modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") modal.close();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    modal.close();
    closeAvatarMenu();
  }
  const row = e.target.closest("[role=button][data-earning]");
  if (row && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    go("earning-detail", { detailId: row.dataset.earning, nav: "overview" });
  }
});

/* demo shortcut: the “exception” walkthrough starts from Payouts → Action needed */
window.__demoSeedPayoutDraft = (methodId, mode) => {
  state.payoutDraft = { methodId, mode, amount: 500 };
};

/* init */
go("overview");
setNav("overview");
