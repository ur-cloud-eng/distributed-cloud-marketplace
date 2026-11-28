# CortexOps EJS frontend

Run the application from the repository root with its usual database and environment configuration. `npm start` serves the public pages, authentication pages, and customer, provider, and administrator portals. The frontend uses the dependencies installed at the repository root.

- `liveRoutes.js` registers the website routes and checks portal access.
- `livePages.js` defines the service catalog and the forms and tables connected to the API.
- `views/live/` contains the EJS layouts and shared form.
- `public/` contains the styles and browser JavaScript served under `/assets`.

Run `npm run test:frontend` from the repository root for the frontend contract and rendering checks.
