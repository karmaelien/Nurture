# Nurture client

Vite + React + TypeScript, styled with Tailwind CSS v4.

```sh
npm install
npm run dev        # http://localhost:5173
```

The app runs against an in-browser mock backend ([MSW](https://mswjs.io)) until the real API exists. Log in with `demo@nurture.app` / `caregiver123`, or create an account. Mock data is stored in your browser's localStorage. To start over, clear the `nurture.mock-db` key.

## Scripts

| Command             | What it does                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`       | Start the dev server                                                                                                                 |
| `npm run build`     | Typecheck and build for production                                                                                                   |
| `npm run lint`      | Lint with oxlint                                                                                                                     |
| `npm run typecheck` | Typecheck only                                                                                                                       |
| `npm test`          | Unit and integration tests (Vitest, jsdom, MSW)                                                                                      |
| `npm run e2e`       | End-to-end tests (Playwright) against the production build, on desktop and mobile. Run `npx playwright install chromium` once first. |
| `npm run format`    | Format with Prettier                                                                                                                 |

## Where things live

| Path                   | Contents                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/theme.css` | Design tokens: colors, fonts, type scale, radii, dark mode. Use these through Tailwind classes such as `bg-primary`, `text-muted`, `rounded-panel`, and `font-display`. Don't hard-code colors. |
| `src/components/ui/`   | Shared building blocks: `Button`, `TextField`, `PasswordField`, `Alert`, `Logo`                                                                                                                 |
| `src/app/`             | Routes and route guards                                                                                                                                                                         |
| `src/api/`             | API client, endpoint functions, and shared request/response types                                                                                                                               |
| `src/mocks/`           | Mock backend for the auth endpoints in [`docs/api-contract.md`](../docs/api-contract.md).                                                                                                       |
| `src/features/`        | Pages, grouped by feature                                                                                                                                                                       |

## Design rules

- **Colors:** everything stays in one family, from deep pine to sage to mint, with charcoal text. Mint (`accent`) is only for small hints: the logo mark, count badges, and dots of 8px or smaller. Never use it on buttons, large fills, or text. Don't introduce a contrasting hue.
- **Type:** Schibsted Grotesk for everything. Use `font-display` on headings (it marks them for tighter tracking). Body text is never smaller than 16px.
- **Dark mode:** colors switch automatically through the tokens, so components don't need `dark:` variants for color.
- **Copy:** sentence case and plain verbs. A button says what it does ("Create account"). Errors say what went wrong and how to fix it.

## Connecting the real backend

Copy `.env.example` to `.env.local` and set `VITE_USE_MOCKS=false`. Then run `npm run dev` from the repository root, which starts the Express server too; the Vite dev server proxies `/api` to it. Set `VITE_API_URL` only when the backend is on a different origin. See [`docs/api-contract.md`](../docs/api-contract.md).
