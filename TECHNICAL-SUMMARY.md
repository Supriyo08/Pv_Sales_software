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
