# Nurture

Family care coordination built with React, JavaScript, Vite, Node.js, and Express.

## Requirements

Use Node.js 24 LTS and npm. All application source is JavaScript.

## Getting started

From the repository root:

```bash
npm run setup
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173).
The API runs at http://localhost:3000; its health endpoint is `/api/health`.
The starter page checks the API connection automatically.

`npm run dev` starts both services. Press Ctrl+C to stop them.
Commit all three package-lock.json files; do not commit node_modules or .env files.

## Structure

- `client/`: React UI and Vite development configuration.
- `server/src/index.js`: Express entry point and health endpoint.
- `server/.env.example`: Optional backend configuration. Copy to `server/.env` to customize.

The default API port is 3000. If you change it, update the proxy target in
`client/vite.config.js` too. The Vite proxy only applies during local development.

## Commands

```bash
npm run dev     # Start frontend and backend
npm run build   # Build frontend into client/dist
npm run lint    # Check frontend JavaScript
```

To run services individually, use `npm run dev --prefix client` or
`npm run dev --prefix server` from the root.

## Frontend preview deployment

After pushing to GitHub, import the repository into Vercel with:

- Framework: Vite
- Root directory: client
- Build command: npm run build
- Output directory: dist

This deploys only the frontend. The starter will show an unavailable API until
backend hosting and production API routing are configured. Do not point a deployed
frontend at localhost. No cloud resources are provisioned by this starter.

## Next steps

PostgreSQL, Prisma, authentication, document storage, and background workers are
not configured yet. Add these with the teammates responsible for those features.
