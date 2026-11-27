# PDF coverage and verification

All 65 PDF pages were visually reviewed. The table records presentation coverage, not completion of backend workflows.

| PDF pages | EJS presentation | Preview paths and remaining work |
| --- | --- | --- |
| 1–2 | Shared colors, typography, controls, navbar and responsive drawer | All portal previews. Record statuses await data. |
| 3 | Customer overview | `/preview/customer`. Metrics, environment hierarchies and activity unavailable. |
| 4–6 | Inventory, resource groups and group detail layout | `/preview/customer/resources`, `/resource-groups`, `/resource-groups/details`. Records, sorting, pagination and mutations need backend integration. |
| 7 | Catalog with all eleven resource choices | `/preview/customer/resources/create`. Selection navigates to the corresponding form. |
| 8–20 | Eleven creation forms with review/prerequisites panels | Append a resource slug to the catalog URL. Available fields validate locally. Prerequisite options, capacity and saving require the backend. VM success/capacity-error transitions remain blocked. |
| 21–30 | Resource type detail, configuration, dependency and activity layouts | `/preview/customer/resources/details/<slug>`. Start/stop/delete/edit require real records. Lifecycle and dependency-blocker confirmation workflows remain unimplemented. |
| 31 | Dependency table and inspection panel | `/preview/customer/dependencies`. Real hierarchy unavailable. |
| 32 | Activity table and filter controls | `/preview/customer/activity`. Queries and result records require backend integration. |
| 33–34 | Notification tabs and unavailable state | `/preview/customer/notifications`. Read status/actions and connected empty state require the backend. |
| 35–41 | Provider overview, hosts, add-host, host detail, capacity/allocation and activity layouts | `/preview/provider`, `/hosts`, `/hosts/create`, `/hosts/details`, `/capacity`, `/activity`. Real capacity bars, duplicate-name errors and mutations await records. |
| 42–51 | Administrator overview, user/provider lists and details, infrastructure tabs, resource inspection and audit layouts | `/preview/admin`, `/users`, `/users/details`, `/providers`, `/providers/details`, `/infrastructure`, `/infrastructure/details`, `/activity`. Records, region distributions and host availability confirmation await the backend. |
| 52–53 | Sign-in and invalid credentials design state | `/preview/auth/login`, append `?state=invalid`. Local validation and show/hide work. Sign-in unavailable. |
| 54 | Registration layout | `/preview/auth/register`. Customer/Provider selection and confirmation validation work. Registration unavailable. |
| 55–56 | Verification pending and four explicitly labeled result previews | `/preview/auth/verify-email`, `/verification-result` under auth. No verification or email is sent. |
| 57–59 | TOTP setup, login challenge and error previews | `/preview/auth/two-factor/setup`, `/two-factor/verify`. Use `?state=invalid` or `?state=expired` for error previews. QR credentials and code verification unavailable. |
| 60–62 | Profile/Security tabs and disable-2FA dialog | `/preview/<role>/account?tab=security`. Unknown status shown. Dialog and code-format validation work. Account mutations unavailable. |
| 63–65 | Proposed password recovery layouts | `/preview/auth/forgot-password`, `/check-email`, `/reset-password` under auth. Token handling and delivery require verified services. |

Resource slugs are `resource-group`, `virtual-network`, `subnet`, `virtual-machine`, `load-balancer`, `blob-storage`, `file-storage`, `managed-sql-server`, `managed-postgresql`, `managed-mysql` and `web-app`.

## Checks executed

- JavaScript syntax checks on the presentation preview and browser form code.
- Final HTTP checks passed for 62 routes/states and 65 internal links/assets, including the screen index and authentication error previews.
- Unknown routes and POST to sign-in return 404. No mutation endpoints were added.
- Edge browser checks for required/email/password confirmation validation, password visibility, TOTP code format, canonical CIDR errors, live review text, filters/reset, tabs, modal Escape dismissal and the mobile menu.
- Edge checks for page overflow at 390px across customer, provider, admin, registration and account screens.
- Browser request inspection confirmed no non-GET submissions during local form checks and no local/session storage use.
- No browser console errors in the tested flows.
- Desktop and mobile screenshots reviewed against the design. Final refined VM field grouping and authentication error states passed another browser check after React/Vite removal.

Backend tests, authentication, authorization, database workflows, real lifecycle transitions and capacity allocation could not be run because the existing backend is absent. This is an EJS frontend implementation with blocked integration. It is not a completed full-stack application.

