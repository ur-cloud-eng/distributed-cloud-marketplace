# Backend integration requirements

The workspace inspected for this task contained the React frontend, installed frontend packages and build artifacts. It contained no existing backend, API route definitions, session middleware, schema or backend tests.

Endpoint availability cannot be established from the provided backend description. The capabilities below require verified existing endpoint paths, methods, field names, authorization rules and response/error formats. No endpoint is claimed to be absent from the real backend, and no replacement API has been implemented.

| Area | Contracts required |
| --- | --- |
| Session and identity | Current user, session expiry, role mapping, logout, login redirect and authorization middleware |
| Registration | Input names, password requirements, Customer/Provider mappings, validation errors |
| Email | Verification, invalid/expired/already-verified results, resend and rate limits |
| TOTP | Enrollment, QR/manual-key response, confirmation, login challenge, invalid/expired/replayed errors, disable confirmation |
| Password recovery | Request, resend, reset and token-error behavior, if supported |
| Profile | Read/edit permissions, update response and field errors |
| Resource groups | List, detail, create, delete, relationships and deletion blockers |
| Resources | Inventory search/filter/sort/pagination, all supported type details, prerequisites and creation/deletion |
| Networking | Valid CIDRs, parent containment, overlaps, compatible VM targets |
| VM lifecycle | Start/stop/delete, transition rules, capacity checks and dependency blockers |
| Hosting | Host list/detail/create/availability/removal, valid regions/classes, ownership and uniqueness |
| Capacity | Totals, allocations, reservation behavior for stopped VMs and free capacity |
| Audit and notifications | Role-scoped activity, notification lists and persistent read actions |
| Administration | Authorized users/providers/infrastructure listings and details, placement visibility and audit logs |
| Request security | Existing CSRF token mechanism, session cookies, origin handling and rate-limit errors |

## Presentation integration

The preview files are presentation tooling. They do not form a replacement backend. Mount the EJS templates and assets in the existing Express application only after its contracts and authorization middleware have been verified.

Use the real server's view root for `frontend/views` and static middleware for `frontend/public`. Replace the preview page configuration with authorized data models. Supply actual metric values, table rows, profile fields, properties and relationship trees rather than the unavailable-state presentation. Keep layout/template names controlled by page handlers.

Form names in `preview/design.js` describe UI fields only. They have not been matched to API payloads. Adapt them to verified contracts. Populate prerequisite selectors from ownership-scoped records and preserve dependencies when selections change. The existing backend remains responsible for ownership, authorization, final validation and lifecycle rules.

All sensitive form submissions are currently intercepted for local validation. Without JavaScript, their fieldsets remain disabled. No passwords or TOTP codes are put into query strings or browser storage. Actual submission buttons remain disabled. Replace the preview guards with verified handlers and CSRF integration when connecting the real backend.

Never mount the public `/preview` routes over authenticated production pages. The role selector is for layout inspection and performs no authentication. The real application must enforce access on every page and action.

## Local validation

Required fields, email syntax, password confirmation, six-digit code shape, resource/group names, positive whole-number capacity and canonical IPv4 network CIDR syntax are checked in the browser.

These checks do not verify credentials, authenticate codes, confirm unique names, validate subnet overlaps, enforce provider capacity or persist data. Password length rules remain pending the existing backend contract.

## Remaining visual states

Backend-driven resource success, insufficient-capacity details, exact dependency blocker lists, populated capacity bars and tables, unread/read notifications and actual account status remain unavailable. Their exact data and transitions require the real records and contracts. Authentication error screens are explicitly marked design previews.

