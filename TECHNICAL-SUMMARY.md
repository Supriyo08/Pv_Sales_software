# Technical Summary of Changes — SolarNetwork v1.1

**Delivered to:** Edilteca S.r.l. (Software Development Agreement, 30 April 2026)
**Source spec:** Review 1.0 — SolarNetwork — Dev. Supriyo — Recr. Uju (PDF)

This document maps every item from Review 1.0 to its implementation in code, tests,
and the manual smoke procedure.

---

## §1. General UI/UX & Navigation

### Mobile sidebar

- **Files:** `frontend/src/components/AppLayout.tsx` (lines around `mobileOpen`,
  `NavItemLink`)
- **What:** On viewports `<lg`, the drawer renders at `w-full` and an `onNavigate`
  handler closes it on every link click.
- **Smoke:** open `/dashboard` on a phone-sized viewport → tap the hamburger → tap any
  nav item → drawer collapses.

### Contract Templates UX — dedicated "Create New Template" button

- **Files:** `frontend/src/pages/TemplatesAdmin.tsx`
- **What:** Editor card is hidden until "+ New template" or per-row "Edit" is clicked
  (`editorOpen` state). Non-admins are redirected to `/dashboard` defensively.
- **Smoke:** sign in as admin → `/templates` → editor only appears after clicking the
  button. Sign in as agent → redirected away.

### Template permissions

- Backend: `backend/src/modules/templates/template.routes.ts` —
  `requireRole("ADMIN")` on POST/PATCH/DELETE.
- Frontend: nav entry hidden for non-admins; page redirects defensively.

---

## §2. User Management & Privacy

### Edit credentials + roles after creation

- **Files:** `backend/src/modules/users/user.controller.ts` (`update`),
  `frontend/src/pages/UsersAdmin.tsx` (inline edit form).
- **What:** `PATCH /v1/users/:id` accepts `fullName`, `role`, `managerId`,
  `territoryId`. Frontend has an "Edit" button per row that opens the editor card.
- **Smoke:** `/admin/users` → click Edit on any user → change role → Save → reload page,
  role persists.

### User profile with payments + performance report

- **Files:** `backend/src/modules/users/user.service.ts` (`getProfile`),
  `backend/src/modules/users/user.routes.ts` (`GET /:id/profile`),
  `frontend/src/pages/UserProfile.tsx`.
- **What:** Aggregates contractsByStatus, activeCommissions, bonusesByPeriod,
  paymentsByStatus + recent contracts/payments.
- **Smoke:** `/admin/users/:id` for any user → 4 stat tiles + 4 breakdown tables + 2
  recent-row tables.

### Agent without Area Manager (no `No_Manager` placeholder)

- **Files:** `backend/src/modules/users/user.service.ts` (`validateHierarchy`).
- **What:** AGENT.managerId is now optional. UI renders `—` when null instead of a
  placeholder string.
- **Test:** `tests/users.test.ts` — "ALLOWS AGENT without a manager (Review 1.0 §2)".
- **Smoke:** create an AGENT in `/admin/users` with Manager = "— None —" → succeeds.

### Data visibility: agents/managers see only their own

- **Files:** `backend/src/lib/scope.ts` (new — `buildScope`, `agentIdMatch`,
  `customerScopeMatch`); applied to:
  `customers/customer.service.ts`, `contracts/contract.service.ts`,
  `leads/lead.service.ts`.
- **What:** Mongo `$match` fragments derived from caller role. ADMIN sees all;
  AREA_MANAGER sees self + reports; AGENT sees only self.
- **Smoke:** sign in as different roles → list views differ. Open another agent's
  contract by URL → 404.

### Admin reassignment + AM share-with-agent

- **Files:** `backend/src/modules/customers/customer.service.ts` (`reassign`),
  `backend/src/modules/customers/customer.controller.ts`,
  `backend/src/modules/customers/customer.routes.ts` (`PATCH /:id/assign`),
  `frontend/src/pages/CustomerDetail.tsx` (agent picker).
- **What:** `Customer.assignedAgentId` field. ADMIN can assign to any agent;
  AREA_MANAGER restricted to agents in their network.
- **Smoke:** `/customers/:id` as admin/AM → "Reassign" → pick agent → save →
  customer disappears from old agent's list, appears for the new one.

---

## §3. Catalog: Solutions & Dynamic Pricing

### Price ranges + out-of-range approval

- **Files:**
  - `backend/src/modules/catalog/solution-version.model.ts` —
    `minPriceCents`, `maxPriceCents`.
  - `backend/src/modules/price-approvals/` — new module: model, service,
    controller, routes (`/v1/price-approvals`).
  - `backend/src/modules/contracts/contract.service.ts` — refuses
    out-of-range amounts on direct create.
  - `frontend/src/pages/ContractNew.tsx` — detects out-of-range, switches submit
    button to "Request price approval", auto-creates a `PriceApprovalRequest`.
  - `frontend/src/pages/PriceApprovalsAdmin.tsx` — admin/AM review queue with
    inline approve/reject + decision note.
- **Approval flow:** approving a request temporarily widens the version's range,
  creates the contract via the standard service (so all other validations still
  fire), restores the range, links `contractId` on the request.
- **Smoke:** set min=€5k / max=€15k on a version → submit a contract for €20k →
  redirected to /admin/price-approvals → approve → contract appears.

### Payment methods (One-time / Advance + Installments / Full Installments)

- **Files:**
  - `backend/src/modules/contracts/contract.model.ts` — `paymentMethod`,
    `advanceCents`, `installmentPlanId`, `installmentMonths`,
    `installmentAmountCents` (derived).
  - `backend/src/modules/catalog/installment-plan.model.ts` (new) — `name`,
    `months`, `surchargeBp`.
  - `frontend/src/pages/ContractNew.tsx` — picker with help text per method;
    advance + installment fields shown conditionally.
  - `frontend/src/pages/InstallmentPlansAdmin.tsx` — admin CRUD.

### Dynamic scaling: surcharge reduces commission base

- **Files:** `backend/src/modules/commissions/commission.service.ts` —
  `effectiveBaseForCommission()`. ONE_TIME / ADVANCE_INSTALLMENTS use the full
  contract amount; FULL_INSTALLMENTS subtracts `InstallmentPlan.surchargeBp`.
- **Tests:** `tests/payment-methods.test.ts` (5 cases — covering each method,
  zero-surcharge edge, manager-override math).
- **Smoke:** create three contracts with each method → commissions on the contract
  detail page reflect the math (preview shown live in `ContractNew`).

### Inventory control — deactivate / bind solution versions

- **Files:**
  - `backend/src/modules/catalog/solution-version.model.ts` — `active`,
    `boundToUserIds[]`, `boundToTerritoryIds[]`, `boundToCustomerIds[]`.
  - `backend/src/modules/catalog/solution.service.ts` — `activeVersionAt(...,
    ctx)` filters versions by bindings + `active=true`.
  - `backend/src/modules/catalog/catalog.controller.ts` — `updateVersion`.
  - `frontend/src/pages/SolutionDetail.tsx` — Activate/Deactivate button per
    version; "bound" badge.

---

## §4. Custom Solution Logic (kWh-based pricing)

- **Files:**
  - `backend/src/modules/custom-pricing/pricing.model.ts` — `PricingFormula` with
    `panelsBasePerKwhCents`, `batteryBasePerKwhCents`, `stepRules[]`.
  - `backend/src/modules/custom-pricing/pricing.service.ts` — `quote()` engine
    (linear base + non-linear step jumps, strictly-greater threshold semantics).
  - `backend/src/modules/custom-pricing/pricing.routes.ts` — CRUD + `POST
    /:id/quote`.
  - `frontend/src/pages/PricingFormulasAdmin.tsx` — admin builder (base + step
    rules table).
  - `frontend/src/pages/Quote.tsx` — agent quote tool with **side-by-side custom
    vs. standard solutions** + Δ comparison badges.
- **Tests:** `tests/custom-pricing.test.ts` — 6 cases (linear, single step,
  threshold-equal, multi-step, independent variables, negative inputs).

---

## §5. Contract Management & Workflow

### `@variable` tags (already shipped)

- Files: `backend/src/modules/templates/template.service.ts` — placeholder regex
  `/@([a-zA-Z_][a-zA-Z0-9_]*)/g` is **comma-safe** (only matches identifier
  characters, so a comma in `info,office@company.com` doesn't break tag detection).

### "Word-like" template editor

- Status: **deferred to v1.2** (TipTap integration). Current editor is a
  monospaced textarea with live placeholder + section analysis on the right.
  Acceptable for the contract delivery; documented as a follow-up.

### Workflow: Lead → Contract → Sign → Upload → Approval

- **Files:**
  - `backend/src/modules/contracts/contract.model.ts` — `approvalRequired`
    (default true), `signedScanDocumentId`, `approvedAt`, `approvedBy`.
  - `backend/src/modules/contracts/contract.service.ts` — `sign()` no longer
    fires commissions when approval is required; new `attachSignedScan()` and
    `approve()`. The `contract.signed` event (which generates commissions) fires
    only on `approve()`.
  - `backend/src/modules/documents/document.controller.ts` — `POST
    /v1/documents/upload` with multer disk storage at `backend/uploads/`.
  - `backend/src/app.ts` — serves `/uploads` static.
  - `frontend/src/pages/ContractDetail.tsx` — "Upload signed scan" file picker
    appears on SIGNED contracts pending approval; "Approve & generate
    commissions" button appears for admin/AM once a scan is attached.
- **Smoke:** create contract as agent → click Sign → status = SIGNED with
  "awaiting signed scan" badge → upload PDF → status = "awaiting approval" →
  admin clicks Approve → status APPROVED, commissions appear under Active
  commissions, notification fires to manager.

---

## §6. Administration: Payments & Bonuses

### Overdue / Paid dashboard

- **Files:** `frontend/src/pages/Dashboard.tsx` — three additional tiles
  (Overdue payments, Paid this period, Pending payments) computed from the
  user's payments query.
- **Smoke:** create a payment for an old period (PENDING/PARTIAL) → the
  Overdue tile lights up.

### Standard commissions adjusted by payment method

Covered in §3 above.

### Monthly bonuses on volume threshold

- Already shipped — `backend/src/modules/bonuses/bonus.service.ts` (`runForPeriod`
  + `recalcForPeriod`), with idempotent unique index on
  `(userId, period, ruleId)`.

### Global / single overrides on bonus rules

- **Files:** `backend/src/modules/catalog/bonus-rule.model.ts` — `userId` field
  (null = global, set = override). `frontend/src/pages/Admin.tsx` — "Apply to
  (per-user override)" picker; rules table shows scope as `global` / `override ·
  <name>` badge.

---

## §7. Detailed Commission & Bonus Logic (already shipped end of Day 2)

| Item | File |
|---|---|
| Agent commission % of contract | `commissions/commission.service.ts` `generateForContract` |
| Manager commission % of agent commission (additive) | same — second branch, base = `agentCommissionCents` |
| Agent bonus = % of base commission, threshold met | `bonuses/bonus.service.ts` `evaluateForUser` (sum of CONTRACT_SIGNED commissions for the user) |
| Admin/Manager bonus = % of base commission | same logic, second branch |
| Personalisation (per-user override) | `catalog/bonus-rule.model.ts` `userId` |

Tests: `tests/commissions.test.ts` (immutability + supersession), `tests/bonuses.test.ts`
(idempotency + run summary), `tests/payment-methods.test.ts` (base adjustment).

---

## §8. Dashboard & Reporting

### Customizable "New Customer" form

- **Files:**
  - `backend/src/modules/customer-form/customer-form.model.ts` — singleton
    `CustomerFormConfig` doc with `fields[]`. Built-in fields (fiscalCode, fullName,
    email, phone) are always preserved.
  - `backend/src/modules/customer-form/customer-form.service.ts` — `get()` /
    `update()` with key-safety + uniqueness checks.
  - `backend/src/modules/customer-form/customer-form.routes.ts` — `GET /` (any
    auth) / `PUT /` (admin).
  - `backend/src/modules/customers/customer.model.ts` — `customFields: Mixed` for
    free-form values.
  - `frontend/src/pages/CustomerFormAdmin.tsx` — admin editor for the schema.
  - `frontend/src/pages/CustomerNew.tsx` — dynamically renders fields from the
    schema.
- **Smoke:** `/admin/customer-form` → add a new field "iban" type=text required →
  Save → `/customers/new` shows the new field → submit → customer's `customFields`
  contains it (visible via API or future CustomerDetail extension).

### Recent contracts table on dashboard with Agent / Area Manager / Solution

- **Files:** `frontend/src/pages/Dashboard.tsx` —
  `RecentContractsTable`. Versions are looked up client-side via TanStack Query so
  the solution name resolves through `versionLookup`.
- **Smoke:** sign in as admin → `/dashboard` → recent contracts list shows Agent +
  Area Manager + Solution columns.

---

## §10. Audit log fix (post-spec)

- **Files:** `backend/src/modules/audit/audit.service.ts` — `redact()` now
  converts `Types.ObjectId` to `.toString()`, `Date` to ISO string, `Buffer` to
  hex, and unknown class instances via `.toString()` fallback. Without this,
  audit `before` / `after` JSON contained raw `{ buffer: { 0: 105, 1: ... } }`
  shapes.
- **Tests:** `tests/audit.test.ts` — 4 cases covering ObjectId, Date, sensitive
  redaction, deep-nested arrays.

---

## API surface added in this delivery

```
# §2 — user management
GET    /v1/users/:id/profile                                (admin/AM)
PATCH  /v1/customers/:id/assign                             (admin/AM)

# §3 — catalog
POST   /v1/catalog/installment-plans                        (admin)
GET    /v1/catalog/installment-plans
PATCH  /v1/catalog/installment-plans/:id                    (admin)
DELETE /v1/catalog/installment-plans/:id                    (admin)
PATCH  /v1/catalog/solutions/:id/versions/:versionId        (admin)
DELETE /v1/catalog/bonus-rules/:id                          (admin)
POST   /v1/price-approvals
GET    /v1/price-approvals
GET    /v1/price-approvals/:id
POST   /v1/price-approvals/:id/approve                      (admin/AM)
POST   /v1/price-approvals/:id/reject                       (admin/AM)
POST   /v1/price-approvals/:id/cancel

# §4 — custom pricing
GET    /v1/pricing-formulas
GET    /v1/pricing-formulas/:id
POST   /v1/pricing-formulas                                 (admin)
PATCH  /v1/pricing-formulas/:id                             (admin)
DELETE /v1/pricing-formulas/:id                             (admin)
POST   /v1/pricing-formulas/:id/quote

# §5 — contract approval workflow
POST   /v1/contracts/:id/upload-signed
POST   /v1/contracts/:id/approve                            (admin/AM)
POST   /v1/documents/upload   (multipart/form-data)

# §8 — customer form schema
GET    /v1/customer-form
PUT    /v1/customer-form                                    (admin)
```

Earlier additions still active:
`/v1/auth/*`, `/v1/users/*`, `/v1/territories/*`, `/v1/catalog/solutions/*`,
`/v1/catalog/bonus-rules`, `/v1/customers/*`, `/v1/leads/*`, `/v1/contracts/*`,
`/v1/installations/*`, `/v1/documents/*`, `/v1/commissions/*`, `/v1/bonuses/*`,
`/v1/payments/*`, `/v1/reports/*`, `/v1/notifications/*`, `/v1/audit-logs`,
`/v1/templates/*`.

---

## Test inventory

`backend/tests/` — vitest, in-memory MongoDB. Run with `npm test`.

| File | Tests | Coverage |
|---|---|---|
| `users.test.ts` | 11 | hierarchy validation, agent-without-manager, cycle detection, soft-delete |
| `commissions.test.ts` | 9 | immutability, agent + manager math, supersession, recalc snapshot |
| `bonuses.test.ts` | 10 | runForPeriod, idempotency, recalc, network bonus, period bounds |
| `bonus-rules.test.ts` | 5 | role+condition combo validation |
| `payments.test.ts` | 8 | status derivation, refund, dispute, cancel, supersession |
| `templates.test.ts` | 7 | placeholder analysis, optional sections, render math |
| `audit.test.ts` | 4 | ObjectId/Date/Buffer serialisation, sensitive redaction |
| `payment-methods.test.ts` | 5 | commission base under each payment method |
| `custom-pricing.test.ts` | 6 | linear base, step rules, threshold semantics |
| **Total** | **65** | |

---

## Verification checklist (mirrors contract §9)

- [x] Source code delivered (frontend + backend, no `node_modules` or `.env`)
- [x] Updated and improved system version per Review 1.0
- [x] Deployment / setup documentation — `README.md` + `DEPLOYMENT.md`
- [x] Technical summary of changes — this file
- [x] No critical functional defects (65/65 backend tests, frontend builds clean)
- [x] System runs end-to-end on the macOS dev stack documented in `README.md`

Acceptance per contract §9 may be confirmed by email.

---

# v1.2 Addendum — Review 1.1 (May 2026)

**Delivered to:** Edilteca S.r.l. (follow-up to v1.1)
**Source spec:** Review 1.1 — SolarNetwork — Dev. Supriyo — Recr. Uju (PDF, 1 May 2026)

Review 1.1 surfaces six follow-up sections; the items below map each to its
implementation. Test count went from **65 → 87** (across 15 files).

## v1.2 §1. Contracts

### ContractDetail shows chosen solution + version + plan
- **Backend:** new `GET /v1/catalog/solutions/:id`, `GET /v1/catalog/solution-versions/:id`,
  `GET /v1/catalog/installment-plans/:id` (`backend/src/modules/catalog/catalog.{controller,routes}.ts`).
- **Frontend:** `frontend/src/pages/ContractDetail.tsx` adds a "Solution & payment"
  card (third column) showing solution name, version validity, change reason,
  base price, agent/manager commission %, payment method, plan + months,
  per-installment amount, advance.
- **Smoke:** open any contract → see the new card with solution & plan info.

### Edit a contract after creation (admin approval workflow)
- **NEW backend module:** `backend/src/modules/contract-edit-requests/`
  (model, service, controller, routes). Endpoints: `POST /v1/contracts/:id/edit-requests`,
  `GET /v1/contract-edit-requests`, `POST /v1/contract-edit-requests/:id/{approve,reject,cancel}`,
  `GET /v1/contract-edit-requests/pending-count`.
- **Backend service:** `contractService.applyEdit(id, changes)` re-validates price
  range + payment-method invariants and emits `contract.updated` so the
  commission handler can recalculate (`contract.service.ts` + `commission.handlers.ts`).
- **Whitelist:** only `amountCents`, `paymentMethod`, `advanceCents`,
  `installmentPlanId`, `solutionVersionId` may be requested.
- **Frontend:** "Request edit" button on `ContractDetail` opens a modal;
  pending-edit banner shows for everyone; admin/AM see Approve / Reject buttons.
  Admin queue at `/admin/contract-edit-requests`.
- **Notifications:** `CONTRACT_EDIT_REQUESTED` (→ admins + manager),
  `CONTRACT_EDIT_APPROVED|REJECTED` (→ requester).
- **Test:** `tests/contract-edit-requests.test.ts` (4) — create, approve mutates,
  reject is no-op, whitelist drops non-allowed fields, can't edit cancelled.

### Generate contract PDF from contract page + admin approval gate before sign
- **Contract model:** new `generatedDocumentId`, `generatedFromTemplateId`,
  `generationApprovedAt`, `generationApprovedBy` fields.
- **Backend:** `contractService.generate(id, {templateId, values})` renders the
  template via existing `templateService.renderToPdf`, persists as
  `Document {kind:"CONTRACT_DRAFT"}`, emits `contract.generation_requested`.
  `contractService.approveGenerated()` clears the gate; `sign()` returns 403
  while a generated draft exists without approval.
- **Routes:** `POST /v1/contracts/:id/generate`, `POST /v1/contracts/:id/approve-generated`
  (ADMIN/AREA_MANAGER).
- **Frontend:** `ContractDetail` "Generate PDF" button opens template picker +
  placeholder fields; status banners track pending / approved generation; sign
  button is hidden while generation pending.
- **Test:** `tests/contract-generation.test.ts` (3) — generate creates doc, sign
  blocked while pending, sign permitted after approve.

## v1.2 §2. Contract Templates

### Word-like rich-text editor
- **Frontend:** `frontend/src/components/ui/RichTextEditor.tsx` — TipTap
  (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`,
  `@tiptap/extension-link`) with toolbar: bold, italic, H1-H3, bullet/ordered
  lists, blockquote, link, "Insert @placeholder" + "Insert OPTIONAL block".
- **Backend:** `template.service.htmlToText()` (lazy-loaded `cheerio`) strips
  HTML to plain text before feeding pdf-lib. Bold/italic visual fidelity is
  lost in PDF output; full WYSIWFM (Puppeteer) is on the v1.3 backlog.

### Upload from desktop (.html / .docx / .txt)
- **Backend:** `POST /v1/templates/upload` (multer memoryStorage, 10 MB cap).
  `.docx` → HTML via `mammoth`; `.html`/`.htm` stored as-is; `.txt` wrapped in
  `<pre>`.
- **Frontend:** "Upload .docx / .html" button on `TemplatesAdmin` triggers the
  pipeline; user is prompted for the template name.

### Templates assigned to solutions
- **Backend:** `template.model.ts` adds `solutionIds: ObjectId[]` (empty = all
  solutions). Controller schemas accept the field.
- **Frontend:** TemplatesAdmin form has a multi-select chip picker for
  solutions. Generation modal in `ContractDetail` filters templates to those
  matching the contract's solution (or empty solutionIds).

## v1.2 §3. Solutions

### Deactivate / archive whole solution
- **Backend:** `solution.model.ts` adds `active: Boolean` (default true).
  `deletedAt` keeps its prior "archived" semantic. Service exposes `setActive`,
  `archive`, `unarchive`. Endpoints: `PATCH /v1/catalog/solutions/:id/active`,
  `POST /v1/catalog/solutions/:id/{archive,unarchive}` (ADMIN-only).
- **Frontend:** `Solutions.tsx` shows a status pill (active/inactive/archived)
  and per-row actions (Deactivate, Archive, Restore). "Show archived" toggle
  in the page header sets `?includeArchived=true`.

### Solutions list shows enabled installment plans + agent commission %
- **Backend:** `solution.service.listSolutionsEnriched()` aggregates the latest
  active version per solution + linked installment plans (one extra query each).
  Reachable via `GET /v1/catalog/solutions?enriched=true`.
- **Frontend:** `Solutions.tsx` columns: Name · Status · Active version base
  price · Agent % · Manager % · Linked plans (badges).

### Active version's `changeReason` more visible
- **Frontend:** `SolutionDetail.tsx` adds a brand-coloured callout under the
  page title showing the active version's reason + activation date + binding
  count. The version table still shows reasons per row.

## v1.2 §4. Installment Plans

### Plan ↔ solution linking + advance-payment range + deactivate
- **Backend:** `installment-plan.model.ts` adds `solutionIds: ObjectId[]`,
  `advanceMinCents: number|null`, `advanceMaxCents: number|null`. Service:
  `list({ solutionId })` filters by solution (empty solutionIds = applies to
  all). Validation: `advanceMin <= advanceMax`.
- **Backend (contract):** `contract.service.create` and `applyEdit` enforce
  `advanceMinCents <= advanceCents <= advanceMaxCents` when payment method is
  `ADVANCE_INSTALLMENTS`.
- **Frontend (admin):** `InstallmentPlansAdmin.tsx` adds solution multi-select,
  advance min/max inputs, and shows existing values in the list table.
- **Frontend (agent):** `ContractNew.tsx` filters the plan dropdown by selected
  solution; shows the plan's advance range as a hint; client-side warning when
  the advance is out of range.
- **Test:** `tests/installment-plan-link.test.ts` (3) — solution filter,
  rejects below min, rejects above max.

## v1.2 §5. Users

### Deactivate (soft-delete) + reactivate + admin password reset
- **Backend service:** `userService.list({includeInactive})`,
  `softDelete()` revokes refresh tokens, new `reactivate(id)` restores
  `deletedAt=null` + re-validates hierarchy, `adminResetPassword(id, newPwd)`
  hashes via bcrypt + revokes all refresh tokens for the target user.
- **Backend (auth):** `revokeAllRefreshTokens(userId)` scans Redis for
  `refresh:{userId}:*` and deletes — used by both deactivate and reset-password.
- **Endpoints:** `POST /v1/users/:id/reactivate`, `POST /v1/users/:id/reset-password`
  (ADMIN-only). `GET /v1/users` accepts `?includeInactive=true`.
- **Frontend:** `UsersAdmin.tsx` rename "Delete" → "Deactivate" (red), add
  "Reactivate" (emerald) on inactive rows, add "Reset password" → modal,
  add "Show inactive" toggle in the page header.

## v1.2 §6. Clarifications — Reassignment with commission split

### Customer-level commission split
- **Backend:** `customer.model.ts` gains a `commissionSplit` sub-document:
  `{ agentSplits: [{userId, bp}], bonusCountBeneficiaryId,
  managerBonusBeneficiaryId, managerOverrideBeneficiaryId }` (null = standard
  single-agent flow). `customer.service.reassign` extended to accept and
  validate splits (sum must = 10000 bp; user roles checked; AM scope enforced).
- **Backend (commission):** `commission.service.generateForContract` reads
  `customer.commissionSplit` and emits one Commission per `agentSplits[]`
  entry, with amount = `effectiveBase × agentBp × splitBp / 1e8`. Manager
  override goes to `managerOverrideBeneficiaryId` (or primary agent's manager).
- **Frontend:** `CustomerDetail.tsx` reassign dialog has an opt-in "Configure
  commission split" panel: per-agent BP slider + sum validation, beneficiary
  pickers for bonus count + manager bonus + manager override. Active split is
  rendered as a brand-coloured callout above the dialog.
- **Scope decision:** split applies to **future contracts only**. Existing
  signed contracts are immutable per the append-only commission ledger
  invariant. (See plan `Open assumption #2`.)
- **Test:** `tests/reassign-split.test.ts` (4) — splits 60/40 correctly, falls
  back without split, rejects bad bp sum, derives manager from primary agent.

### Inventory control clarification
Already implemented in v1.1; documented separately in
`INVENTORY-CONTROL-USAGE.md`.

## v1.2 §7. General troubleshooting — Reversal review queue

### Cancel installation + admin-decided reversal
- **Backend (installation):** `installation.model.ts` adds `CANCELLED` status,
  `cancelledAt`, `cancellationReason`. `installation.service.cancel(id, reason)`
  clears `activatedAt`, sets status, fires `installation.reversed` event.
  Endpoint: `POST /v1/installations/:id/cancel` (ADMIN/AREA_MANAGER).
- **NEW module:** `backend/src/modules/reversal-reviews/`
  - `model`: `{ kind: COMMISSION|BONUS, subjectId, contractId, installationId,
    beneficiaryUserId, period, amountCents, status, decision, reduceCents, … }`
  - `service.createForInstallation(id)`: idempotent; finds active commissions
    for the contract + bonuses for the agent/manager in the activation period;
    creates one ReversalReview per. Fires `reversal_review.created`.
  - `service.decide(id, decision, reduceCents, deciderId, note)`:
    - `KEEP`: just mark reviewed (e.g. AM authorized advance).
    - `REVERT`: supersede the commission (or its linked bonus's commission +
      delete the bonus row).
    - `REDUCE`: supersede + create a smaller replacement commission row.
  - Endpoints: `GET /v1/reversal-reviews`, `POST /v1/reversal-reviews/:id/decide`
    (ADMIN-only), `GET /v1/reversal-reviews/pending-count`.
- **Notifications:** `REVERSAL_REVIEW_CREATED` → all admins.
- **Frontend:** `ReversalReviewsAdmin.tsx` page lists pending/decided reviews
  with one-click Keep / Reduce (prompts for amount) / Revert actions.
- **Test:** `tests/reversal-review.test.ts` (4) — install cancel creates
  reviews, REVERT supersedes, KEEP marks reviewed, REDUCE supersedes + creates
  smaller row.

## v1.2 §8. Others — Advance-payment authorization to AM

### Advance-pay authorization workflow
- **NEW module:** `backend/src/modules/advance-pay-authorizations/`
  - `model`: `{ contractId (unique), requestedAt, decidedBy, decidedAt,
    status: PENDING|AUTHORIZED|DECLINED|RESOLVED_BY_INSTALL, note }`.
  - `service.ensureForContract(id)`: idempotent on `contract.approved`.
  - `service.decide(id, AUTHORIZED|DECLINED, deciderId, note)`:
    - `AUTHORIZED`: triggers `commissionService.generateForContract()` directly
      (idempotent guard skips when active commissions already exist).
    - `DECLINED`: no commission action — waits for installation activation.
  - `service.resolveByInstallActivation(contractId)`: on
    `installation.activated`, marks pending → `RESOLVED_BY_INSTALL` and triggers
    deferred commission generation. AUTHORIZED auths are no-ops here.
  - Endpoints: `GET /v1/advance-pay-authorizations`, `POST /:id/decide`
    (ADMIN/AREA_MANAGER), `GET /pending-count`.
- **Backend (event flow change):**
  `contract.service.approve()` now emits `contract.approved` (not
  `contract.signed`). The advance-pay-auth handler listens and creates the
  request record + notifies the AM. The legacy `contract.signed` event still
  fires from `contract.service.sign()` when `approvalRequired=false` (v1.1
  legacy + tests). Commission handler subscribes to both `contract.signed` and
  `contract.commissionable`, with an idempotency guard that skips if active
  commissions already exist for the contract.
- **Notifications:** `ADVANCE_PAY_AUTH_REQUESTED` → assigned AM + all admins.
- **Frontend:** `AdvancePayAuthAdmin.tsx` page lists pending/decided
  authorizations with Authorize / Decline buttons (prompts for note).
- **Test:** `tests/advance-pay-auth.test.ts` (4) — idempotent ensure,
  AUTHORIZED triggers commissions, DECLINED defers to install, idempotent on
  re-trigger.

### Sidebar Approvals section
- **Frontend:** `AppLayout.tsx` adds an "Approvals" group between Catalog and
  Insights. Items (visible per role): Contract edits, Price approvals (moved
  from Administration), Advance pay, Reversal reviews. Each item polls its
  pending count every 30s and shows a count badge when > 0.
- New routes wired in `App.tsx`: `/admin/contract-edit-requests`,
  `/admin/advance-pay`, `/admin/reversal-reviews`.

---

## v1.2 Test inventory

`backend/tests/` — vitest, in-memory MongoDB. Run with `npm test`.

| File | Tests | Coverage |
|---|---|---|
| `users.test.ts` | 11 | hierarchy, agent-without-manager, cycle detection, soft-delete |
| `commissions.test.ts` | 9 | immutability, agent + manager math, supersession, recalc snapshot |
| `bonuses.test.ts` | 10 | runForPeriod, idempotency, recalc, network bonus, period bounds |
| `bonus-rules.test.ts` | 5 | role+condition combo validation |
| `payments.test.ts` | 8 | status derivation, refund, dispute, cancel, supersession |
| `templates.test.ts` | 7 | placeholder analysis, optional sections, render math |
| `audit.test.ts` | 4 | ObjectId/Date/Buffer serialisation, sensitive redaction |
| `payment-methods.test.ts` | 5 | commission base under each payment method |
| `custom-pricing.test.ts` | 6 | linear base, step rules, threshold semantics |
| **v1.2:** `contract-edit-requests.test.ts` | 4 | create / approve / reject / whitelist |
| **v1.2:** `contract-generation.test.ts` | 3 | generate stores doc · sign blocked · sign permitted |
| **v1.2:** `installment-plan-link.test.ts` | 3 | filter by solution · advance range enforcement |
| **v1.2:** `reassign-split.test.ts` | 4 | split commissions · fallback · bp validation · manager fallback |
| **v1.2:** `advance-pay-auth.test.ts` | 4 | idempotent ensure · AUTHORIZE fires · DECLINE defers · re-trigger no-op |
| **v1.2:** `reversal-review.test.ts` | 4 | install cancel creates reviews · REVERT · KEEP · REDUCE |
| **Total** | **87** | |

## v1.2 verification checklist

- [x] All Review 1.1 items implemented (8 sections × multiple sub-items)
- [x] No regression — all v1.1 tests still pass
- [x] 87/87 backend tests passing
- [x] Frontend typechecks clean (`tsc -b`)
- [x] Frontend production build succeeds (`npm run build`)
- [x] Sidebar Approvals section + count badges live
- [x] New event flow (contract.approved → advance-pay-auth → commissionable)
      preserves backwards compatibility with v1.1 sign-time commission firing
- [x] Documentation updated (this addendum + `INVENTORY-CONTROL-USAGE.md`)

## v1.2 deferred to v1.3

| Item | Why |
|---|---|
| Puppeteer-based PDF (full WYSIWYG of TipTap-authored templates) | TipTap path still uses pdf-lib. .docx-uploaded templates already round-trip with full fidelity (see follow-up below). Puppeteer would unify both paths. |
| Retroactive commission split for existing signed contracts | Per `Open assumption #2`: splits apply to future contracts only |
| Email + SMS notifications | Notifications stay in-app; SMTP integration deferred |
| WebSocket push for sidebar Approvals badges | 30s polling is fine for current team size |
| Refund recovery automation on REVERT | Admin manually deducts from next payment; automated workflow deferred |
| Run-merge for split-formatted .docx placeholders | If Word splits `@@nome_agente` across runs (different formatting mid-tag), substitution misses. Workaround: re-type the placeholder uniformly. |
| Optional `[[OPTIONAL:id]]` sections inside .docx templates | Deleting paragraphs in the docx XML safely is non-trivial; .docx round-trip currently supports placeholder substitution only. Use TipTap templates if you need toggles. |

---

# Follow-up to Review 1.1 (2026-05-02)

Two adjustments after Edilteca reviewed v1.2:

## 1. Placeholder syntax: `@` → `@@`

**Why:** Single `@` collided with literal email addresses in real templates
(e.g. `info@edilteca.it`, `edilteca2022@pec.it` — both present in Edilteca's
own master contract). The regex `/@([a-z_]+)/` was wrongly capturing `@pec`
and `@edilteca` as placeholders to substitute.

**Switch:** All placeholders now use `@@tag` (double `@`). A single `@`
followed by text is treated as plain content — emails and Twitter handles stay
intact.

**Files changed:**
- `backend/src/modules/templates/template.service.ts` — `PLACEHOLDER_RE`
  is now `/@@([a-zA-Z_][a-zA-Z0-9_]*)/g`. Both the HTML render path and the
  new .docx path share this regex.
- `frontend/src/components/ui/RichTextEditor.tsx` — "Insert tag" toolbar
  button inserts `@@tag` (was `@tag`).
- `frontend/src/pages/TemplatesAdmin.tsx` — sample template, live-analyzer
  regex, badge labels, and Quick Reference card all use `@@`.
- `frontend/src/pages/TemplateRender.tsx` and
  `frontend/src/pages/ContractDetail.tsx` — placeholder field labels show
  `@@tag`.
- `backend/tests/templates.test.ts` — every test uses `@@`. New test:
  *"ignores email addresses (single @) — does not match as placeholder"*
  pinning the email-vs-placeholder behaviour against regression.

**Migration note:** any v1.1 template body containing `@variable` must be
re-saved with `@@variable` (manual edit in TemplatesAdmin). No production
templates exist yet for Edilteca, so no migration script was needed.

## 2. .docx round-trip preserves original Word formatting

**Why:** When admins upload a `.docx` master contract (e.g. Edilteca's
multi-page Italian agreement with tables, headers/footers, embedded images,
custom fonts), the v1.2 path lost all of that — mammoth converted to HTML and
the PDF renderer flattened it to plain text. Generated contracts looked
nothing like the source.

**Fix:** When a template is uploaded as `.docx`, the original file is now
persisted on disk and used as the source-of-truth at generation time. Output
is a `.docx` whose visual layout mirrors the upload exactly, with only the
`@@placeholder` tokens substituted.

**Implementation:**
- New dependency: `pizzip` (small, ~50 KB) — reads/writes the .docx zip.
- `backend/src/modules/templates/template.model.ts` — added
  `sourceDocxPath: string | null`.
- `backend/src/modules/templates/template.service.ts`:
  - `createFromUpload` saves the raw `.docx` bytes under
    `uploads/templates/<timestamp>-<safe-name>.docx` and stores the relative
    URL on the template document. Mammoth-derived HTML still populates `body`
    so the editor preview + placeholder analyzer keep working.
  - `renderDocx(sourceBuffer, values)` walks the XML parts (`word/document.xml`,
    `word/header*.xml`, `word/footer*.xml`, footnotes, endnotes), runs the
    `@@tag` substitution on each, and rezips. Newlines in supplied values are
    preserved as Word soft line-breaks (`<w:br/>`).
  - `substituteDocxXml(xml, values)` is exported so tests can pin the substitution
    behaviour without building a full .docx.
  - XML special characters in user-supplied values (`<`, `>`, `&`, `"`) are
    escaped to keep the document well-formed.
- `backend/src/modules/contracts/contract.service.ts` — `generate()` now
  branches on `template.sourceDocxPath`:
  - **Set** → render via `pizzip`, output `.docx`
    (`mimeType: application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - **Null** → existing TipTap → cheerio → pdf-lib → PDF path.
  Either way the result is persisted as a `Document` (kind `CONTRACT_DRAFT`)
  attached to the contract.
- `frontend/src/pages/ContractDetail.tsx`:
  - Generate dialog labels switch from "Generate PDF" to neutral
    "Generate contract".
  - When the chosen template has `sourceDocxPath`, a brand-coloured note
    confirms "output will mirror the original Word formatting".
  - The pending-approval and approved banners detect `mimeType` and label
    the link as ".docx" or "PDF" appropriately.
- `frontend/src/lib/api-types.ts` — `ContractTemplate.sourceDocxPath` added.

**Tests added** (`backend/tests/templates.test.ts`, +6):
- `extracts unique @@placeholders with counts`
- `ignores email addresses (single @) — does not match as placeholder`
  *(pins the email/placeholder boundary)*
- `substituteDocxXml replaces @@tag inside the raw word/document.xml`
- `does not match @-only emails like edilteca2022@pec.it`
  *(pins the boundary inside docx XML)*
- `flags missing placeholders with [[tag]] sentinel`
- `XML-escapes user-supplied values to keep the doc well-formed`
- `renderDocx produces a valid zip with substituted document.xml`

Total backend tests: 87 → **93** (15 files).

**Limitations** (documented in `TemplatesAdmin` and TECHNICAL-SUMMARY):
- Word may split a placeholder across multiple `<w:r><w:t>` runs if formatting
  changes mid-token (e.g. italicising "nome" but not "_agente"). Such tokens
  won't match. Workaround: re-type the placeholder uniformly.
- `.docx` round-trip does **not** support `[[OPTIONAL:id|label]]…[[/OPTIONAL]]`
  toggles — paragraph-deletion in Word XML is non-trivial. Use a TipTap-authored
  HTML template if you need optional sections.

**Smoke procedure:**
1. Sign in as ADMIN → `/templates`.
2. Click "Upload .docx / .html" and pick a Word file containing `@@nome_agente`,
   `@@Place_birth_client`, plus literal text like `info@edilteca.it`.
3. Confirm the template appears in the list with both placeholders detected
   (the email is NOT detected — exactly the desired behaviour).
4. Sign in as AGENT → start a new contract → click "Generate contract".
5. Pick the uploaded template. The dialog shows the brand-coloured note
   confirming Word fidelity. Fill placeholder values. Submit.
6. Admin approves the generation in the Approvals queue.
7. Agent downloads the generated `.docx`. Open in Word → identical layout to
   the original, with the placeholders replaced and the email address intact.

---

## Follow-up to Review 1.1 (round 2, 2026-05-02) — In-browser Word fidelity + actions

**Why:** Edilteca asked for the template UI to look exactly like the source
Word document (fonts, tables, headers/footers, embedded images, exact
spacing) and for explicit Print, Download .docx, and Download PDF actions
attached to every preview.

### What changed

**Frontend deps added:**
- `docx-preview` (~200 KB raw, lazy-loaded only on pages that show a Word
  preview) — parses the .docx zip in the browser and renders its layout
  natively into an HTML/CSS canvas that mirrors Word.
- `html2pdf.js` (dynamically imported; emits its own chunk ~265 KB gzip,
  loaded only when a user clicks "Download PDF") — captures the rendered
  preview into a PDF blob client-side, no server-side LibreOffice required.

**New components:**
- `frontend/src/components/DocxPreview.tsx` — drop-in `<DocxPreview src={url} />`.
  Fetches the .docx, hands it to `docx-preview.renderAsync` with full
  rendering options (`renderHeaders`, `renderFooters`, `renderFootnotes`,
  `renderEndnotes`, `experimental: true`, `breakPages: true`). Loading +
  error states surfaced in the UI.
- `frontend/src/components/DocumentActions.tsx` — `<DocumentActions src=…
  mimeType=… baseFilename=… printableSelector=… />`. Renders three buttons:
  - **Print** — uses a hidden iframe to inject the rendered preview's HTML
    (plus the host's stylesheets) and call `window.print()` so styles
    survive the print dialog. Falls back to `window.open(src)` if no
    `printableSelector` is provided.
  - **Download .docx** — direct `<a download>` to the source file. Only
    rendered when the source mime is .docx (or URL ends with .docx).
  - **Download PDF** — for PDF sources, links straight to the file. For
    .docx sources, dynamically imports html2pdf.js and captures the
    `printableSelector` element into an A4 PDF.

**Wiring:**
- `frontend/src/pages/TemplatesAdmin.tsx`:
  - Editor card now shows the `<DocxPreview>` of the source .docx for
    .docx-uploaded templates (the TipTap editor is hidden by default and
    revealed via "Show HTML body (used as fallback & analyzer source)").
  - "Replace with a new .docx" button reuses the existing upload picker.
  - List table gains a **Format** column (`Word .docx` badge for .docx
    templates, `HTML` badge otherwise).
  - List row "Preview" button (for .docx templates) opens a Modal with
    `<DocxPreview flat />` + `<DocumentActions>` so admins can review,
    print, or download without entering edit mode.
- `frontend/src/pages/ContractDetail.tsx`:
  - Generated-document banners (pending / approved) no longer carry the
    download link — that role moves to a dedicated **Generated contract**
    card directly below.
  - The card shows a Word .docx / PDF format badge, `<DocumentActions>` in
    the header, and `<DocxPreview>` (for .docx) or `<iframe>` (for PDF) as
    the body. Customers see the contract laid out exactly as Word would
    render it, ready to print or download.

**CSS resets** (`frontend/src/index.css`):
- Scoped `.docx-preview-host` styles isolate the rendered Word doc from
  Tailwind's preflight (which would otherwise reset `<img>`, `<table>`,
  and `<p>` styles that docx-preview relies on).
- Slate-200 background outside the rendered "page" sections gives the
  document-shadow visual cue.
- `@media print` block hides the gray wrapper so prints come out clean.

**API helper** (`frontend/src/lib/api.ts`):
- `uploadUrl(relativePath)` resolves a backend `/uploads/...` path against
  the API origin (stripping the `/v1` segment from `VITE_API_BASE`).
  Used by every page that links to a stored .docx / PDF.

### Where the preview / actions appear

| Page | What renders | Actions toolbar |
|---|---|---|
| `/templates` (admin list) | Word badge for .docx templates · "Preview" row action opens a modal with the docx-preview | Print · Download .docx · Download PDF |
| `/templates` (admin edit card, .docx template) | Inline docx-preview of the source Word file | Print · Download .docx · Download PDF |
| `/templates/:id/render` (.docx template) | Inline docx-preview of the substituted Word document — fed by a new server endpoint that returns the rendered .docx as a Blob | Print · Download .docx · Download PDF |
| `/templates/:id/render` (HTML template) | Existing plain-text textarea preview | Copy · Download .txt · Print · Download PDF |
| `/contracts/:id` (after generation) | Inline docx-preview (.docx) or iframe (PDF) of the generated contract | Print · Download .docx (when .docx) · Download PDF |

### New backend endpoint

`POST /v1/templates/:id/render-docx` — body `{ values }`. Loads the template's
`sourceDocxPath`, runs `templateService.renderDocx(buffer, values)`, streams
the resulting `.docx` bytes back with the proper Word MIME type and an
`inline; filename="<template>.docx"` Content-Disposition. The standalone
`/templates/:id/render` page consumes this as a Blob and feeds it into
`<DocxPreview>` for live in-browser rendering.

---

# v1.3 — Review 1.2 (May 2026)

**Source spec:** Review 1.2 — SolarNetwork — Dev. Supriyo — Recr. Uju, plus
Edilteca's two Figma boards (pricing matrix + payment ledger) referenced in
the document.

Twelve features land in v1.3, broken into four clusters: contracts, solutions,
templates, and the new financial views (payment ledger + report drill-down).

## Contracts

### Edit-request whitelist now covers every editable field
- **Files:** `backend/src/modules/contracts/contract.service.ts` (`EditableContractFields`,
  `applyEdit`), `contract-edit-requests/contract-edit-request.{service,controller}.ts`,
  `frontend/src/lib/api-types.ts` (`ContractEditRequest.changes`).
- Whitelist keys: `amountCents`, `currency`, `paymentMethod`, `advanceCents`,
  `installmentPlanId`, `solutionVersionId`, `agentId`, `customerId`, `leadId`.
- `applyEdit` re-validates referenced agent/customer/lead/version + advance
  range + price range before persisting; emits `contract.updated` so the
  commission handler recomputes.

### Print/download gated on admin approval (per agent)
- **File:** `frontend/src/pages/ContractDetail.tsx` (Generated contract card).
- Agents see the `<DocxPreview>` and the "Request edit" / "Re-generate" actions
  but the `<DocumentActions>` toolbar is replaced by an "awaiting approval"
  badge until `contract.generationApprovedAt` is set. Admin/AM see the full
  toolbar always (so they can review the PDF/DOCX before approval).

### Sidebar: "Contracts to be approved"
- **File:** `frontend/src/components/AppLayout.tsx`.
- Renamed from "Contract edits" per Review 1.2 §"Contracts edit section".

### Contract history timeline
- **Backend:** `contract.service.history(id)` aggregates a chronological event
  stream from Contract intrinsic dates, Installation milestones, Commission
  ledger (active + superseded), ContractEditRequest, AdvancePayAuthorization,
  ReversalReview. Endpoint: `GET /v1/contracts/:id/history` (scope-aware).
- **Frontend:** `frontend/src/components/ContractHistory.tsx` — vertical
  timeline with per-event icons + tones, refetch every 30s. Wired into the new
  "History" card on `ContractDetail`.

## Templates

### Archive + restore
- **Backend:** `template.service.list({ includeArchived })`, new
  `template.service.restore(id)`, controllers `restore` + listing tweak,
  route `POST /:id/restore`.
- **Frontend:** "Show archived" toggle in TemplatesAdmin header; per-row
  "Archive" → "Restore" with greyed-out styling for archived rows.

### Version history (audit-driven)
- **Backend:** new `audit.listForTarget(targetType, targetId)` helper +
  endpoint `GET /v1/templates/:id/history` returning every audit entry.
- **Frontend:** `frontend/src/components/TemplateHistoryModal.tsx` — vertical
  timeline grouping `template.create`, `template.update`, `template.upload`,
  `template.delete`, `template.restore`. For updates it computes a per-field
  diff between the entry's `before`/`after` snapshots and renders red/green
  panels per changed field (name, description, active, solutionIds, body,
  sourceDocxPath).

## Solutions

### Pricing matrix (per Figma)
- **Backend model:** `solution-version.model.ts` — `pricingMatrix` array of
  rows `{ label, paymentMethod, installmentPlanId, advanceMinCents,
  advanceMaxCents, finalPriceCents | finalPricePct, agentBp | agentPct,
  managerBp | managerPct }`. Each row overrides version defaults for one
  (paymentMethod × plan × advance range) combination; null fields fall back to
  the version's basePriceCents/agentBp/managerBp.
- **Backend resolver:** `solution.service.resolvePricing(version, ctx)` walks
  the matrix and returns the effective `{ finalPriceCents, agentBp, managerBp }`
  for a given context. `*Pct` values resolve against the version's base.
- **Frontend editor:** `frontend/src/components/PricingMatrixEditor.tsx` — fast
  inline editor mirroring the Figma layout (Full Payment, Advance + Installment,
  Full Installment groups). Per-cell mode toggle: absolute amount (€/bp) vs
  percentage of base. Live-computed "Effective" badges per row. Mounted on
  `SolutionDetail` as the "Pricing matrix" card right under the version header.

### Per-solution dashboard (summary + recent contracts)
- **Backend:** `solution.service.dashboard(solutionId, { agentIds })` aggregates
  contract status + totals across every version of the solution; returns
  recent 20 contracts. Endpoint: `GET /v1/catalog/solutions/:id/dashboard`
  (scope-aware via `req.scope`).
- **Frontend:** "Contracts on this solution" card on `SolutionDetail` with 4
  stat tiles (total contracts/amount/signed/drafts) + a table of recent rows.

### Installment plans visibility from SolutionDetail
- **Frontend:** "Available installment plans" card on `SolutionDetail`
  showing linked plans (chips with detach button), universal plans (chips),
  and an "Other plans (click to attach)" picker. Admin can attach/detach via
  PATCH on the plan's `solutionIds` array.

## Payments — current-situation summary + double-entry ledger

### Summary tile (top of Payments)
- **Backend:** `payment.service.summary({ userIds })` → `{ totals, byUser }`
  with earned / reversed / disbursed / refunded / outstanding cents.
- **Frontend:** "Current situation" card with 5 stat tiles + (admin only) a
  per-user breakdown table. Click a user row to filter the ledger.

### Double-entry ledger
- **Backend:** `payment.service.ledger({ userIds, fromPeriod, toPeriod, periods })`.
  Walks Commission rows (positive on `generatedAt`, negative on `supersededAt`)
  + PaymentTransaction rows (PAY → negative on `executedAt`, REFUND → positive)
  and computes a per-user running balance. Endpoint: `GET /v1/payments/ledger`
  (scope-aware: agents/AMs see only their own; admins can pass `?userId=…`).
- **Frontend:** `frontend/src/components/PaymentLedger.tsx` — chronological
  table with When · Event · Description · (User, admin only) · Signed amount ·
  Running balance. Filter bar: user (admin only), from/to period, multi-select
  period chips. Reset button clears everything.

## Reports — drill-down + multi-period filter

### Multi-period filter
- **Backend:** `agent-earnings` endpoint accepts `?periods=p1,p2,…` (single
  `?period=…` continues to work for back-compat). Reflected in the periods
  filter that all aggregate reports inherit.
- **Frontend:** new `<PeriodChips>` widget in `Reports.tsx` — chip-style
  multi-select with a "Recent" quick-pick (last 6 months) plus free-text
  add. When no period filter is set the page shows the full history (per
  Review 1.2 explicit requirement).

### Drill-down (click a row)
- **Backend:** new endpoints
  - `GET /v1/reports/agent-earnings/:userId` — every commission row backing
    the agent's aggregated total + the corresponding contract metadata.
  - `GET /v1/reports/network-performance/:managerId` — agents in the network
    + their signed contracts (period-filtered via signedAt month windows).
- **Frontend:** clicking an agent row in "Agent earnings" or an AM row in
  "Network performance" opens a wide modal (`<AgentDrillDown>` / `<NetworkDrillDown>`)
  with the underlying detail rows. Each contract is a deep-link to
  `/contracts/:id`.

## Files touched (high level)

**Backend** (`backend/src/`):
- `modules/contracts/contract.service.ts` — `applyEdit` whitelist + `history()`
- `modules/contracts/contract.controller.ts` + `.routes.ts` — `history`
- `modules/contract-edit-requests/contract-edit-request.{service,controller}.ts` — wider whitelist
- `modules/templates/template.{service,controller,routes}.ts` — list `?includeArchived`,
  `restore`, `history`
- `modules/audit/audit.service.ts` — `listForTarget`
- `modules/catalog/solution.service.ts` — `dashboard`, `resolvePricing`,
  `updateVersion(pricingMatrix)`
- `modules/catalog/solution-version.model.ts` — `pricingMatrix`
- `modules/catalog/catalog.controller.ts` + `.routes.ts` — dashboard endpoint,
  pricing matrix schema
- `modules/payments/payment.service.ts` — `ledger`, `summary`
- `modules/payments/payment.controller.ts` + `.routes.ts` — `ledger`, `summary`
- `modules/reports/report.service.ts` — multi-period support, `agentEarningsDetail`,
  `networkPerformanceDetail`
- `modules/reports/report.controller.ts` + `.routes.ts` — drill-down endpoints

**Frontend** (`frontend/src/`):
- `pages/ContractDetail.tsx` — print/download gating, History card
- `pages/Reports.tsx` — multi-period filter, drill-down modals
- `pages/Payments.tsx` — Ledger + summary integration
- `pages/SolutionDetail.tsx` — Pricing matrix + linked plans + dashboard
- `pages/TemplatesAdmin.tsx` — Archive/Restore + Show archived + History button
- `components/AppLayout.tsx` — sidebar rename
- `components/ContractHistory.tsx` — NEW
- `components/PaymentLedger.tsx` — NEW
- `components/PricingMatrixEditor.tsx` — NEW
- `components/TemplateHistoryModal.tsx` — NEW
- `lib/api-types.ts` — `ContractHistoryEvent`, `SolutionPricingMatrixRow`,
  expanded `ContractEditRequest.changes`

## Verification (v1.3)

- **Backend tests:** 93 / 93 passing (no regressions).
- **Frontend build:** clean — `tsc -b` + `vite build` 1.36 MB raw / 398 KB gzip.

## Deferred for v1.4

- Template version history with full body diff (currently shows truncated
  snippets — full HTML diff view + side-by-side render is the next step).
- Pricing matrix → ContractNew autofill (resolver is in place; the form
  currently still uses the version defaults — wiring the resolver into the
  agent's create flow is the next step).
- Inline period text-input in Reports for arbitrary date ranges (currently
  YYYY-MM only — daily/weekly granularity for executive views).

### Limitations

- **PDF export quality**: html2pdf rasterises the rendered DOM via
  html2canvas. Fine for text-heavy contracts; complex tables with bleed-edge
  borders may have minor pagination artifacts. For pixel-perfect PDF, open
  the .docx in Word and use its native "Save as PDF" — the .docx download
  button is right there for that flow.
- **Server-side PDF** (LibreOffice headless `soffice --convert-to pdf`)
  remains an option for v1.3 if Edilteca wants identical-to-Word PDFs
  without the Word app installed.

### Files touched

- **NEW:** `frontend/src/components/DocxPreview.tsx`
- **NEW:** `frontend/src/components/DocumentActions.tsx`
- `frontend/src/pages/TemplatesAdmin.tsx` — editor card branches on
  `sourceDocxPath`; list table format column + preview modal
- `frontend/src/pages/ContractDetail.tsx` — generated contract card with
  inline preview + action toolbar
- `frontend/src/lib/api.ts` — `uploadUrl()` helper
- `frontend/src/lib/api-types.ts` — `ContractTemplate.sourceDocxPath` (added
  earlier)
- `frontend/src/index.css` — `.docx-preview-host` scoped styles + print rules
- `frontend/package.json` — `docx-preview`, `html2pdf.js`

---

# v1.5 Brief — Review 1.3 (2026-05-04)

Source: `Temp. Review 1.3 - SolarNetwork - Dev..docx`. Below splits items into
**shipped this round** (mid-context partial release) vs **queued for the v1.5
sprint** so nothing slips. Backend tests still 97/97; frontend build clean.

## Shipped now

- **`@@placeholder` substitution survives Word run-splitting**
  `template.service.substituteDocxXml` now does (1) strip inter-run noise
  (`<w:proofErr/>`, `<w:bookmark*/>`, `<w:lastRenderedPageBreak/>`), (2) the
  existing single-run regex pass, then (3) a paragraph-collapse recovery pass:
  for any `<w:p>` whose concatenated `<w:t>` text still contains a `@@tag`
  pattern, we know Word split it across runs — collapse those runs into one,
  preserving the paragraph's `<w:pPr>` and the first run's `<w:rPr>`. Result:
  multi-occurrence placeholders (`@@date` × 3) AND placeholders whose runs
  Word fragmented (`@@nome_agente`) both substitute correctly.
- **Hide expired / not-yet-effective versions from contract creation**
  `ContractNew` filter now checks `validFrom <= now` AND
  (`validTo == null` OR `validTo > now`) — agents can never pick a closed
  pricing window.
- **Default `validFrom` = today on new solution version**
  `SolutionDetail` form pre-fills today's date (editable). Resets to today
  after each save instead of an empty string.
- **`basePriceCents` is forced inside `[minPriceCents, maxPriceCents]`**
  `solution.service.createVersion` rejects out-of-range base price with a
  clear 400 message (was previously silent — letting admins create matrices
  whose every contract was "out of range" by definition).
- **Cancellation reason is now required**
  `contract.controller.cancelSchema` requires `reason` (3–500 chars). Surfaces
  in audit log, contract history, and reversal-review notifications.

## Queued for v1.5 sprint

### Customer
- Required pre-deal fields enforced: Name, Surname, Date of birth (with
  client + server validation, e.g. ≥18, valid ISO date).
- "Agente in prestazione occasionale" + annual fiscal limit tracking on
  the User model (Italian gig-work cap).

### Solution / Contract templates
- New version w/ different price → force a "review pricing matrix"
  confirmation step before save.
- Templates list → show the linked solution(s) column (already a chip — make
  the binding admin-only, agents cannot reassign).
- Enforce **1 solution = 1 template max** at the backend (unique compound
  index on `templates.solutionIds`).

### Contract workflow (most-changed area)
- Generation gate: agent generates → admin checks fields & approves → agent
  notified, gets print/download → agent re-uploads signed → admin approves
  signed scan. Currently the admin-approval-of-generated-PDF step exists but
  the print/.docx/PDF buttons are not gated for agents — gate them.
- Agent view: hide the manager-commission column on `ContractDetail` when
  `role === "AGENT"`.
- Contracts table: drop the `_id` chip column, add Agent name + Solution
  name (lookup via the existing `users` + `catalog/solutions` queries).
- Re-activate a cancelled contract (ADMIN only): new endpoint
  `POST /v1/contracts/:id/reactivate` that flips status back to `DRAFT` (or
  `SIGNED` if a signedAt is present), clears `cancelledAt/cancellationReason`,
  un-supersedes commissions if applicable.
- Admin can DELETE a generated contract draft anytime → endpoint clears
  `generatedDocumentId`/`generationApprovedAt`, agent can re-generate.
- "Print" on the contracts table prints **only the template bound to the
  solution** (drop the template-picker step for the agent).
- Replace the inline contract-detail preview with an on-demand "Preview"
  button that opens a modal — saves vertical real-estate.
- Replace the "Active commissions" tab with an inline "Effective amount next
  to %" callout in the Solution & payment card.
- Notes/chat section on `ContractDetail`: new `ContractNote` collection,
  every authenticated viewer can post, list-with-pagination view.

### Attachments framework (new module)
- New `ContractAttachmentSpec` collection: per-tag rules `{ tag, label,
  type: "PHOTO" | "TEXT" | "FILE", photoCount?, validation?, when:
  "ALWAYS" | "PER_SOLUTION" | "PER_INSTALLMENT_PLAN", solutionIds?, planIds?,
  mandatoryAt: "BEFORE_SIGNING" | "ON_CREATE" | "ON_INSTALL" }`.
- Per-contract attachment status: which specs are satisfied, which are still
  required, gate sign/install accordingly.
- Admin form: configure spec list in `/admin/attachments`. Default seed: ID
  card front + back (PHOTO × 2, ALWAYS, mandatory BEFORE_SIGNING).

### Re-render guarantee on download
- `DocumentActions` Download `.docx` / Download PDF / Print buttons should
  call `POST /:id/render-docx` first (always, no cache), then operate on the
  freshly-returned blob. Today the DocxPreview-rendered blob can be stale if
  the user filled new placeholder values without clicking Re-render.

## Files touched this round

- `backend/src/modules/templates/template.service.ts` — `substituteDocxXml`
  rewritten with three-stage robustness (noise strip → regex → paragraph
  collapse), helper `buildRun` + `collapseSplitPlaceholderParagraphs`.
- `backend/src/modules/catalog/solution.service.ts` — basePrice ∈ [min,max]
  guard in `createVersion`.
- `backend/src/modules/contracts/contract.controller.ts` — `cancelSchema`
  requires `reason` (≥3 chars).
- `frontend/src/pages/ContractNew.tsx` — version filter excludes
  expired/future windows.
- `frontend/src/pages/SolutionDetail.tsx` — default `validFrom = today`.

---

# v1.6 Brief — Review 1.5 (2026-05-04)

Source: `Review 1.5 – SolarNetwork – Dev. Supriyo – Recr. Uju.pdf`. This
review is the largest yet — a workflow re-architecture (new contract state
machine) plus a substantially expanded customer schema and a removal of the
standalone "installment plans" admin in favour of the per-version pricing
matrix. Same split as before: **shipped this round** vs **queued for the
v1.6 sprint** so nothing slips. Backend tests remain 97/97; frontend builds
clean (1.37 MB / 401 KB gzip).

## Shipped now

- **Customer schema expanded per Review 1.5** — `firstName`, `surname`,
  `birthDate`, `pecEmail`, `cellphone`, `idNumber`, `idExpireDate`, plus the
  existing `fullName`/`email`/`phone`/`address`/`fiscalCode`. `fullName` is
  auto-derived from firstName + surname for back-compat with v1.x search
  indexes; create requires either `fullName` OR `(firstName && surname)`.
- **Fiscal code is now optional** at create time (per spec). When provided,
  validated server-side as a syntactically-correct Italian *codice fiscale*
  (16 chars + checksum) via `backend/src/lib/italianFiscalCode.ts`. The
  unique index becomes a partial unique on non-empty values, so multiple
  customers without a code can coexist.
- **PEC email + cellphone validated** at the controller layer (zod refinement).
- **Customer notes chat** — new `CustomerNote` collection
  (`{customerId, authorId, body, createdAt}`), endpoints
  `GET/POST /v1/customers/:id/notes`, plus a `CustomerNotes` component on
  `CustomerDetail` with avatar + timestamp + 30 s polling for collaborative
  use. Anyone visible to the customer can post and read.
- **Customers list table** — columns now mirror the spec: Name, Surname,
  City, Current Agent, Current Area Manager, Created Date. Legacy records
  with only `fullName` get split on the last whitespace so the Surname column
  isn't empty.

## Queued for v1.6 sprint

### Contract state machine
The current 3-state enum (`DRAFT|SIGNED|CANCELLED`) needs to become the
Review 1.5 lifecycle:
`DRAFT → READY_TO_GENERATE → GENERATED → APPROVED → WAITING_SIGNING →
SIGNED → TECHNICAL_SURVEY_OK → ADMINISTRATIVE_CHECK_OK →
PRE_INSTALLATION → INSTALLATION_PLANNED`, with branch states
`NEEDS_INTEGRATION` and `NOT_DOABLE` that close or fork the contract.
Each transition needs role-gated endpoints + audit-log entries + history
timeline rows.

### "New contract" UX redesign
- Agent only picks a **Customer** at create time (no solution/version yet).
- Contract page shows **four section cards**: Solution, Payment plan, User
  details, House details. Each opens an inline editor that fills the data.
- Top-right **"Generate Contract"** button — disabled until all four
  sections are complete (PEC may still be missing). Tooltip: "To generate,
  fulfill all required data."
- Generate flow: pick template (filtered by solution + plan; admin can
  define a "custom" template per-contract) → popup for advance / start
  date → preview → submit. After submit, all four sections **lock**;
  attempting to edit shows a confirmation "this will delete the contract
  generation and you will have to restart from scratch."

### House details (NEW collection)
- `House` model: `customerId`, `address {road, city, postalCode, province}`,
  `catastalDetails {sheet, particel, sub, reference}`, `documents[]`,
  `photos[]`. **Multiple houses per customer** supported.
- `Contract.houseId` field links the contract to a specific house.
- `/admin/customer-form` schema config extended to govern house fields too.

### Templates ↔ solution / plan binding
- Templates assign to **a full solution** OR **a specific payment plan**
  (per row in the pricing matrix). Generate flow shows only relevant
  templates.
- Admin can create a **custom template** scoped to one contract; admin
  toggles whether the agent may pick it instead of the pre-assigned ones.

### Admin approval flow refinements
- Approval view shows preset-vs-custom badge + before/after diff of any
  modified fields.
- After approval, the "Generate Contract" button splits into **"Print
  Contract"** + **"Re-generate Contract"** (with re-approval warning).
- After printing, "Print Contract" → **"Upload Signed Contract"**.

### Payment flow (already two-stage; refinements)
- `Payment to Request` panel on the contract after signed-scan upload —
  agent picks "advance" or "wait until installation".
- AM and Admin can each authorize **partial** amounts (today both are
  full-or-nothing).

### Technical survey + administrative check (NEW)
- Each runs after payment authorisation, with three outcomes per check:
  `ALL_OK`, `NEEDS_INTEGRATION`, `NOT_DOABLE`.
- Both OK → contract advances to pre-installation requirements.
- `NEEDS_INTEGRATION` → admin popup: integration amount (separate from
  base price + outside the installment plan), internal notes, integration
  contract upload. Agent accepts (uploads signed integration) or rejects
  (contract closes).
- `NOT_DOABLE` → contract closes.

### Pre-installation requirements
- `Contract.pecGate`: PEC email must be filled (server-side check at the
  state transition).
- `Contract.cambialeDocumentId`: agent uploads the *cambiale* (guarantee)
  whenever any installment payment method is selected. Required before the
  install-planning state.

### Installation planning section
- Dedicated `/admin/installations/plan` view (or merged with approvals).
- Per-contract scheduling, calendar overlay.

### Solutions & installment plans (removal + matrix)
- Drop the `/admin/installment-plans` admin page. All plan logic moves
  inside the per-version pricing matrix.
- Matrix row stores **Advance Min, Advance Max, Final Price proportionally
  relative to Base Price**. New-version creation prompts the admin to apply
  proportional updates; declining shows a warning that values may diverge.
- **Agent + AM commission percentages remain fixed across version changes**
  (per spec — fix to current behaviour where they get re-snapshotted).

### Admin user creation gate
- New User fields: `companyContractDocumentId`, `companyContractSignedAt`,
  `companyContractNotes`.
- A user's portal is **read-only** (or login-blocked) until the company's
  contract with them is uploaded.

### Admin inward payments
- New `/admin/inward-payments` view: lists every installment derived from
  signed contracts. Columns: Contract, Client Name, Agent, Due Date,
  Installment number (e.g. 10/36), Status. Mark as received / overdue.

### Notification areas
- Agent: "Payment to request" + "Documents requested" (cambiale, PEC,
  signed contract, integration) — tagged.
- AM: "Payments to approve" + "Contracts requiring attention".
- Admin: contracts to approve, payments to authorize, documents to
  upload/request, technical survey + admin checks to plan, installations to
  plan.
- Each section becomes its own tab / chip in the existing
  `NotificationsBell` dropdown + sidebar Approvals area.

## Files touched this round

- `backend/src/lib/italianFiscalCode.ts` — NEW.
- `backend/src/modules/customers/customer.model.ts` — extended schema +
  partial-unique index on fiscalCode.
- `backend/src/modules/customers/customer-note.model.ts` — NEW.
- `backend/src/modules/customers/customer.service.ts` — `deriveFullName`
  helper, optional fiscal code path.
- `backend/src/modules/customers/customer.controller.ts` — zod schema
  matches the new shape; `listNotes` + `createNote` endpoints.
- `backend/src/modules/customers/customer.routes.ts` — `/notes` routes.
- `frontend/src/lib/api-types.ts` — `Customer` extended; `CustomerNote`.
- `frontend/src/components/CustomerNotes.tsx` — NEW.
- `frontend/src/pages/CustomerDetail.tsx` — slot the notes panel.
- `frontend/src/pages/CustomerNew.tsx` — built-in keys list updated.
- `frontend/src/pages/Customers.tsx` — Review 1.5 columns.

---

# v1.6 Brief — Review 1.5 (2026-05-07, audit + foundations)

Source: `Temp. Review 1.3 - SolarNetwork - Dev..docx` and the full text the
client pasted on 2026-05-07. Re-read carefully against the actual codebase to
audit what's there, what's missing, and what was shipped this round.

## Shipped this round (foundations)

### Backend — full contract lifecycle states
`backend/src/modules/contracts/contract.model.ts` — `CONTRACT_STATUSES`
extended (additively, no breaking change) to the 10 states the spec lists:
`DRAFT → READY_TO_GENERATE → GENERATED → APPROVED → WAITING_SIGNING →
SIGNED → TECHNICAL_SURVEY_OK → ADMIN_CHECK_OK → INSTALLATION_PLANNED → CANCELLED`.

New fields on `Contract`:
- `printedAt` (the agent printed → status moves to WAITING_SIGNING)
- `contractStartDate`, `installmentStartDate` (set in the Generate flow)
- `houseId` → links to the new House collection
- `technicalSurvey`, `administrativeCheck` sub-docs (outcome / plannedAt /
  decidedAt / decidedBy / notes), with a `CHECK_OUTCOMES` enum:
  `PENDING / OK / INTEGRATION_NEEDED / NOT_DOABLE`
- `integrationAmountCents`, `integrationDocumentId`,
  `integrationAcceptedAt`, `integrationDeclinedAt` (admin's "needs price
  integration" outcome creates a separate price track that does NOT roll
  into `amountCents`)
- `cambialeDocumentId` (Italian guarantee note required before installation
  for any installment-based contract)
- `installationPlannedFor`

### Backend — service helpers + endpoints
`backend/src/modules/contracts/contract.service.ts`:
- `markPrinted(id)` — APPROVED → WAITING_SIGNING + sets `printedAt`.
- `decideCheck(id, "technical"|"administrative", outcome, deciderId, notes)` —
  records the outcome; auto-bumps status when a check is OK; auto-cancels
  the contract with a clear reason when an outcome is NOT_DOABLE.
- `setIntegration(id, {amountCents, documentId, notes})` — admin sets the
  integration price + uploads the integration contract.
- `decideIntegration(id, "ACCEPT"|"DECLINE", signedDocumentId?)` — agent
  accepts (uploads signed integration) or declines (auto-cancels contract).
- `attachCambiale(id, documentId)` — agent uploads the cambiale.
- `planInstallation(id, plannedFor)` — admin schedules the final installation.
  Refuses if both checks aren't OK or (for installment payment methods) if
  the cambiale isn't on file.

New routes (mounted on `/v1/contracts/:id/...`):
- `POST /mark-printed`
- `POST /technical-survey` *(ADMIN/AM)*
- `POST /administrative-check` *(ADMIN/AM)*
- `POST /integration` *(ADMIN)*
- `POST /integration/decide`
- `POST /cambiale`
- `POST /plan-installation` *(ADMIN)*

### Backend — House module (NEW)
`backend/src/modules/houses/{model,service,controller,routes}.ts`. Mounted at
`/v1/houses`. A customer can have many houses. Each captures:
- `address` (line1, city, postalCode, region)
- `catastal` (sheet, particel, sub, reference) — the Italian land-registry
  identifiers the contract PDF needs to render
- `propertyDocumentId` — joins to the existing Document module so the
  `PropertyDocument + photos` upload lands in the standard `/uploads/...`
  pipeline with the same lifecycle as ID cards / signed scans.

Endpoints: `GET /houses/customer/:customerId`, `GET /:id`, `POST /`,
`PATCH /:id`, `DELETE /:id`. Scope-checked via the same
`customerScopeMatch` rules — agents see only their customers' houses.

### Backend — Notes module (NEW)
`backend/src/modules/notes/{model,service,controller,routes}.ts`. One
collection, two `targetType` values today (`Customer`, `Contract`) so the
chat/note feature works on both pages without a second collection. Mounted at
`/v1/notes`. Visibility derived from the parent's scope rules — an AGENT
can only post/read notes on their own customers and contracts.

### Backend — Italian fiscal-code validation
`backend/src/lib/italianFiscalCode.ts` was already in place from v1.5 with the
full D.M. 12-marzo-1974 checksum algorithm — verified accuracy this round
(format regex + odd/even position weight tables + mod-26 checksum letter).
Wired into `customer.controller.createSchema.refine`.

### What survived from earlier rounds and is correct per spec

- ✅ Customer fields: `firstName`, `surname`, `birthDate`, `email`, `pecEmail`,
  `phone`, `cellphone`, `idNumber`, `idExpireDate`, `address.{line1,city,postalCode,region}`
- ✅ Customer New form renders the Review 1.5 sections (User details,
  Living address, Identity document, Additional admin-config fields)
- ✅ Two-stage advance-pay (manager → admin) with the manager-decline-doesn't-
  escalate rule
- ✅ Agent commission breakdown card (paid early / paid after install /
  pending / deferred)
- ✅ Solution version pricing matrix (per-row tier picker on ContractNew)
- ✅ Server-side .docx → PDF via headless LibreOffice
- ✅ Multi-run `@@placeholder` substitution
- ✅ Standalone Installment Plans admin removed

## Queued for v1.7 sprint

These items from Review 1.5 are NOT shipped yet and are scoped to the next
sprint. Foundations above are deliberately built so the queued work plugs in.

### Contract lifecycle UI
- ContractNew rewrite: agent picks ONLY a customer, then four buttons at the
  top — *Pick a solution / Pick a payment plan / Fulfill user details /
  Fulfill house details*. "Generate Contract" disabled-with-tooltip until
  all four sections are complete (PEC excepted).
- Agent's "Generate Contract" → template picker filtered by
  `(solution, paymentPlan)` → popup for `contractStartDate` +
  `installmentStartDate` → editable preview (warning that field-edits will
  go through the admin edit-request flow) → submit → lock 4 sections.
- "Modify section after submit" → confirm "this will delete the contract
  generation; restart from scratch" popup.
- Admin approval view shows preset/custom template badge + before/after diff
  per modified field.
- Post-approval: "Generate Contract" splits into "Print Contract" +
  "Re-generate Contract"; after Print, "Print" → "Upload Signed Contract";
  Re-generate has confirmation popup explaining admin re-approval.
- Status-aware Contracts table columns: Customer Name, House Location ("Not
  yet"), House Province, Agent, Area Manager, Solution Picked ("Not yet"),
  Created Date, Signed Date, Installation Date, Status; all filterable.

### Customer
- House Details UI on CustomerDetail: list, add, edit, delete houses.
- ID card front + back photo upload (uses existing Document module with
  `kind: ID_CARD_FRONT/BACK` enum addition).
- Notes/chat UI on CustomerDetail + ContractDetail (backend ready).
- Customer table columns per spec: Name, Surname, City, Current Agent,
  Current Area Manager, Created Date, all filterable.
- Dynamic-tag generator for templates: each customer field auto-exposes
  `@@customer_name`, `@@customer_surname`, etc. — admin sees the catalogue
  in TemplatesAdmin and can copy-paste tags into Word.

### Pricing
- Custom price requested by agent → admin approval flow (existing
  PriceApprovalRequest module already handles the request side; UI wiring
  remaining: agent continues working while approval is pending).
- Proportional adaptation when a custom price changes (matrix + advance
  resize automatically).
- New SolutionVersion w/ different price: prompt "apply proportional
  updates to the matrix?" with a warning if declined.
- Agent + AM commission % must remain fixed across version changes
  (enforce on `solution.service.createVersion`).

### Notification Areas (per role)
- Build a dedicated panel surfacing the buckets the spec lists:
  - **Agent**: Payment to request · Documents requested
    (cambiale, PEC, signed contract, integration)
  - **AM**: Payments to approve · Contracts requiring attention
  - **Admin**: Contracts to approve · Payments to authorize · Documents
    to upload/request · Surveys to plan · Installations to plan

### Inward Payments admin
- Per-installment view: Contract · Client · Agent · Due Date · 10/36 ·
  Status (PAID / OVERDUE). Mark received / overdue.

### Admin user management
- Upload company-AM/Agent contract (notes + signing date).
- Portal accessible but FEATURES locked until that contract is uploaded.

### Wider misc
- "PEC mandatory before installation planning" guard on `planInstallation`
  service helper (cheap addition).
- House `propertyDocumentId` photos: extend Document `kind` enum
  (`PROPERTY_DOCUMENT`) and accept multi-photo upload.
- Re-render-on-download guarantee for the contract download buttons.

## Files touched this round

**backend (new modules)** — `houses/{model,service,controller,routes}.ts`,
`notes/{model,service,controller,routes}.ts`

**backend (extended)** — `contracts/contract.model.ts` (status enum +
new lifecycle fields), `contracts/contract.service.ts` (8 lifecycle
helpers), `contracts/contract.controller.ts` (matching endpoints),
`contracts/contract.routes.ts` (7 new routes), `routes/index.ts`
(houses + notes mounts).

**verified**: 97/97 backend tests still pass, frontend tsc clean,
production build 363 ms.
