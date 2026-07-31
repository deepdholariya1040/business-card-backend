# RBAC

Unchanged from the existing implementation (`src/config/roles.js`,
`role.middleware.js`, `permission.middleware.js`, `tenant.middleware.js`).

## Roles

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full access: all companies, users, cards, limits, plans, subscriptions, audit logs, analytics |
| `MAIN_COMPANY_ADMIN` | Full access within own company; can create Company Admins and Staff; views company cards/analytics |
| `COMPANY_ADMIN` | Own company only; manages Staff; cannot create/remove Main Company Admin or access its protected data |
| `STAFF` | Own cards only (create/view/update/delete); cannot see other Staff's or any admin's data |
| `NORMAL_USER` | Own profile + own cards only |

## Enforcement

- `auth.middleware.js` resolves the JWT to a live `User` document and
  attaches `{ id, email, role, companyId, tenantId, canManageStaff }` to
  `req.user`.
- `role.middleware.js` — allow-list of roles per route.
- `permission.middleware.js` — fine-grained permission checks (see
  `src/constants/permissions.js`).
- `tenant.middleware.js` — ensures `MAIN_COMPANY_ADMIN`/`COMPANY_ADMIN`
  requests carry a valid `companyId`/`tenantId`, and scopes queries to it.
- Ownership checks (Staff A vs Staff B, User A vs User B) are enforced in
  each module's service/controller (see `businessCard.controller.js`'s
  `canAccessCard`, `user.service.js`).

No changes were made to any of these files' logic in this upgrade — only
additive fields (audit logging, IP/device tracking) were layered on top.
