# Inventory Control — Usage Guide

**Per Review 1.0 §3 + Review 1.1 §6 clarification:**
> "Admins should be able to temporary de-activate solutions or bind specific
> versions to a specific agent, network, or client."

This was implemented in v1.1; Review 1.1 asked for clarification on how to use
it. This document is the operator guide.

## Two scopes of "deactivation"

The platform separates **temporary deactivation** from **archival**:

| Action | Field | Effect | Reversible? |
|---|---|---|---|
| Deactivate solution | `Solution.active = false` | Hidden from agents; admin still sees it. | Yes — click "Activate" |
| Archive solution | `Solution.deletedAt = <date>` | Hidden everywhere unless "Show archived" is on. | Yes — click "Restore" |
| Deactivate version | `SolutionVersion.active = false` | Other versions of the same solution remain selectable. | Yes — toggle on the version row |
| Bind version | `SolutionVersion.boundToUserIds / boundToTerritoryIds / boundToCustomerIds` | Only matching context can pick it. Empty arrays = no binding. | Yes — clear the binding |

## How to use each action

### 1. Deactivate a whole solution (e.g. supplier issue, temporary outage)

1. **UI:** Sidebar → Catalog → Solutions
2. Locate the solution row
3. Click the **Deactivate** action (Power icon, Status pill turns "inactive")
4. Agents creating contracts will no longer see this solution in their picker
5. Active contracts and historical commissions are unaffected
6. Click **Activate** at any time to bring it back

### 2. Archive a solution permanently

1. Same row, click **Archive** (red, Archive icon)
2. Confirm the prompt — solution disappears from the list
3. To see archived solutions later, toggle "Show archived" in the page header
4. Click **Restore** (ArchiveRestore icon) to bring it back

### 3. Deactivate a single version (e.g. price needs revision)

1. Sidebar → Catalog → Solutions → click the solution name
2. In the **Versions** table, find the row
3. Toggle the **Active** switch off
4. Other active versions of the same solution remain selectable. If you
   deactivate the only active version, agents cannot create contracts for that
   solution at all (effectively the same as deactivating the solution).

### 4. Bind a version to specific agents / territories / customers

The binding determines **who** can pick the version. Empty arrays = no binding
(everyone with the active rule can use it). Non-empty = ONLY those targets.

1. Sidebar → Catalog → Solutions → click the solution
2. Click **Edit** on the version
3. Three picker fields:
   - **Bind to users**: select specific agents — only they will see the version
   - **Bind to territories**: only agents whose territory matches will see it
   - **Bind to customers**: only contracts for these customers can use it
4. Save

The matching logic is OR within a category, AND across categories:
- A version bound to user A AND territory B is visible only when:
  the agent is A **and** the contract's territory is B.

### 5. Verify what an agent will see

The fastest way: log in as that agent and start a new contract. Their solution
list reflects all the rules above (active solution + active version + matching
binding).

## Common scenarios

### Pilot a new solution with one agent first

1. Create the solution + version as usual
2. On the version, bind it to the pilot agent's user id (`boundToUserIds: [agent_id]`)
3. The agent is the only one who can pick it
4. After the pilot, clear the binding (empty array) → opens to everyone

### Deprecate an old plan but keep it for grandfathered customers

1. Set `boundToCustomerIds` to the list of grandfathered customer ids
2. New customers won't see this version; only the listed ones can keep using it
3. To fully retire, deactivate the version once the last grandfathered contract
   is signed

### Stop selling in a territory temporarily

1. Either:
   - Deactivate every version bound to that territory (granular), OR
   - Deactivate the entire solution (sweeping; affects all territories)
2. The territory filter still applies for historical reporting; only the
   selectability changes

## API reference (for scripted operators)

| Action | Endpoint |
|---|---|
| List enriched solutions (status + plans + commission) | `GET /v1/catalog/solutions?enriched=true&includeArchived=true` |
| Deactivate solution | `PATCH /v1/catalog/solutions/:id/active` body `{ "active": false }` |
| Activate solution | `PATCH /v1/catalog/solutions/:id/active` body `{ "active": true }` |
| Archive solution | `POST /v1/catalog/solutions/:id/archive` |
| Restore solution | `POST /v1/catalog/solutions/:id/unarchive` |
| Deactivate version | `PATCH /v1/catalog/solutions/:id/versions/:vid` body `{ "active": false }` |
| Bind version to users | `PATCH /v1/catalog/solutions/:id/versions/:vid` body `{ "boundToUserIds": ["..."] }` |

All actions are ADMIN-only and audit-logged.

## Files

- `backend/src/modules/catalog/solution.model.ts` — `active`, `deletedAt`
- `backend/src/modules/catalog/solution-version.model.ts` — `active`,
  `boundToUserIds`, `boundToTerritoryIds`, `boundToCustomerIds`
- `backend/src/modules/catalog/solution.service.ts` —
  `setActive`, `archive`, `unarchive`, `activeVersionAt(solutionId, at, ctx)`
  (the binding-aware lookup used at contract create time)
- `frontend/src/pages/Solutions.tsx` — list + status pill + actions
- `frontend/src/pages/SolutionDetail.tsx` — version table with active toggle +
  binding pickers
