# CortexOps EJS frontend

Run these commands in PowerShell.

```powershell
cd frontend
npm ci
npm start
```

From inside `frontend/`, open http://127.0.0.1:3000/preview for the screen index. The root opens the customer overview. Use `npm run dev` for Node's watch mode. Set `$env:PORT='3188'` before starting to choose another port.

This folder is an isolated EJS/HTML/CSS/vanilla JavaScript frontend preview. The preview server in `preview/server.js` is only for viewing designs, and must not be mounted as unauthenticated production routes. The project backend remains separate.

The implementation uses EJS, HTML, CSS and vanilla JavaScript. The existing frontend styles were reused. The application binds to localhost.

## Structure

- `frontend/views/partials` contains the shared head, navigation, navbar, field, filter, table and unavailable-state components.
- `frontend/views/pages` contains customer, provider, administrator and shared account layouts.
- `frontend/views/auth` contains the authentication layouts.
- `frontend/public` contains CSS, JavaScript and the existing bell asset.
- `frontend/preview` contains the isolated presentation preview and design field definitions.

The preview contains GET page routes and static assets. It has no data persistence or authentication implementation. Public role preview URLs contain no private records and confer no account access.

Actual records are unavailable, so dashboards show dashes and tables show unavailable states. Sample users, example resources and fake totals are absent. Forms check input format locally and update review panels. Controls that require backend services are disabled.

See `frontend/INTEGRATION.md` for required backend contracts and `frontend/COVERAGE.md` for page coverage and verification. Existing backend source was absent from this workspace. No backend business logic, APIs, database schema or database files were changed.

