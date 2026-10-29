# Nurture

Family care coordination built with React, TypeScript, Vite, Node.js, and Express. A shared hub for families providing informal care: medications, appointments, documents, costs, and updates in one place.

## Requirements

Use Node.js 24 LTS and npm. The client is TypeScript; the server is JavaScript.

## Getting started

From the repository root:

```bash
npm run setup
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173).
The API runs at http://localhost:3000; its health endpoint is `/api/health`.
Until the real auth endpoints exist, the client uses an in-browser mock backend.
Log in with `demo@nurture.app` / `caregiver123`. See [`client/README.md`](client/README.md).

`npm run dev` starts both services. Press Ctrl+C to stop them.
Commit all three package-lock.json files; do not commit node_modules or .env files.

## Structure

- `client/`: React + TypeScript UI. See its README for scripts, design rules, and the mock backend.
- `docs/api-contract.md` (added in #1): The API the client expects. Backend endpoints should match it.
- `server/src/index.js`: Express entry point and health endpoint.
- `server/.env.example`: Optional backend configuration. Copy to `server/.env` to customize.

The default API port is 3000. If you change it, update the proxy target in
`client/vite.config.ts` too. The Vite proxy only applies during local development.

## Commands

```bash
npm run dev     # Start frontend and backend
npm run build   # Build frontend into client/dist
npm run lint    # Lint the frontend
npm test        # Run frontend unit and integration tests
```

To run services individually, use `npm run dev --prefix client` or
`npm run dev --prefix server` from the root.

## Frontend preview deployment

After pushing to GitHub, import the repository into Vercel with:

- Framework: Vite
- Root directory: client
- Build command: npm run build
- Output directory: dist

This deploys only the frontend, which runs the in-browser mock backend until
backend hosting is configured and the build sets `VITE_USE_MOCKS=false`. Do not point a deployed
frontend at localhost. No cloud resources are provisioned by this starter.

## Next steps

PostgreSQL, Prisma, authentication, document storage, and background workers are
not configured yet. Add these with the teammates responsible for those features.
