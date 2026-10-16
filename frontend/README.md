# SynchroSC Frontend — React Control Tower

A professional enterprise supply-chain resilience control tower built with React 19, TypeScript, Vite, and React Router. Demonstrates a complete disruption-to-recovery workflow with mock and live API modes.

## Requirements

- Node.js 20+
- npm (comes with Node.js)

## Installation

```bash
cd frontend
npm ci
```

## Environment configuration

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (includes `/api`) | `http://localhost:8000/api` |
| `VITE_DEMO_MODE` | `true` = mock provider, `false` = live API | `true` |

Never commit `.env` or real credentials.

## Development server

```bash
npm run dev
```

Opens at the Vite URL shown in the terminal (default: `http://localhost:5173`).

## Production build

```bash
npm run build
```

Output goes to `dist/`. Requires TypeScript to pass with no errors.

## Type check / lint

```bash
npm run lint
```

Runs `tsc --noEmit`. No ESLint is configured; TypeScript strict mode is the primary quality gate.

## Tests

```bash
npm test
```

Runs Vitest in run mode (single pass). Uses jsdom environment and React Testing Library.

```bash
npm run test:watch
```

Runs Vitest in watch mode for development.

## Mock mode (VITE_DEMO_MODE=true)

- No backend required.
- Uses `src/api/mockProvider.ts` with internally consistent demo fixtures.
- State persists across page navigation via `localStorage`.
- Clearly labelled "DEMO · SIMULATED DATA" in the UI.
- Supports the full golden-path workflow: create disruption → analyze → compare scenarios → select → approve → execute → audit.
- Reset mock state: open browser DevTools → Application → Local Storage → delete `synchrosc_mock_state`.

## Live API mode (VITE_DEMO_MODE=false)

- Set `VITE_API_BASE_URL=http://localhost:8000/api` (or your deployment URL).
- Start the backend: see `backend/README.md` or the root `README.md`.
- If the backend is unavailable, the UI shows an explicit connection error — it does not silently fall back to mock data.

## API endpoint mapping

| UI action | Method | Endpoint |
|---|---|---|
| Load dashboard KPIs | GET | `/dashboard/summary` |
| List disruptions | GET | `/disruptions` |
| Create disruption | POST | `/disruptions` |
| Get incident | GET | `/incidents/{id}` |
| Run analysis | POST | `/incidents/{id}/analyze` |
| Get impact | GET | `/incidents/{id}/impact` |
| Get scenarios | GET | `/incidents/{id}/scenarios` |
| Select scenario | POST | `/incidents/{id}/select-scenario` |
| List approvals | GET | `/approvals` |
| Submit decision | POST | `/approvals/{id}/decision` |
| Execute action | POST | `/actions/{scenario_id}/execute` |
| Get audit | GET | `/incidents/{id}/audit` |

All requests go through `src/api/client.ts`. The base URL is read from `VITE_API_BASE_URL`.

## Troubleshooting

**CORS errors in browser console**
- Ensure the backend has CORS configured to allow `http://localhost:5173` (or your frontend origin).
- Check `backend/app/main.py` for `CORSMiddleware` configuration.

**API connectivity errors**
- Verify the backend is running: `curl http://localhost:8000/api/health`
- Check `VITE_API_BASE_URL` does not have a trailing slash and includes `/api`.
- Do not set `VITE_DEMO_MODE=false` unless the backend is running.

**Mock state is stale**
- Open DevTools → Application → Local Storage → delete `synchrosc_mock_state`.
- Or run `localStorage.removeItem('synchrosc_mock_state')` in the browser console.

**TypeScript errors after pulling changes**
- Run `npm ci` to ensure dependencies are up to date.
- Run `npm run lint` to see all type errors.

## Golden-path demo (5-minute walkthrough)

1. Open `http://localhost:5173` — see the Control Tower with DEMO banner.
2. Click **Simulate disruption** → review the pre-filled SHP-102 form → **Submit simulation**.
3. The app auto-analyzes and navigates to the incident detail page.
4. Verify: CMP-201, 500 available units, 100 units/day demand, 5-day coverage, 12-day revised ETA.
5. Review affected production orders (PO-5001 critical, PO-5002 high, PO-5003 normal).
6. View 4 recovery options — compare cost, arrival days, policy disposition, residual risk.
7. Note: SCN-WAIT is BLOCKED. SCN-TRANSFER is AUTO_ALLOWED (partial). SCN-ALT-SUPPLIER and SCN-EXPEDITE require approval.
8. Click **Select this plan** on "Order from approved alternate supplier (SUP-B)" (₹64,000).
9. App navigates to Approval Queue — approval APR-xxx created because ₹64,000 > ₹50,000 threshold.
10. Click **Approve plan** → add comment → confirm.
11. App navigates back to incident — status is READY_TO_EXECUTE.
12. Click **Execute simulation** → confirm the dialog.
13. See success notice with action ID and audit ID. Status becomes VERIFIED.
14. Click **Audit** → review the full chronological timeline.
15. Demonstrate rejection: repeat from step 8, click **Reject** instead — incident returns to OPTIONS_READY, no execution occurs.

## Manual QA checklist

- [ ] Control Tower loads with KPI cards and incident table
- [ ] DEMO / SIMULATED DATA banner is visible at all times
- [ ] Empty state shown when no incidents exist
- [ ] Create disruption modal opens with SHP-102 pre-filled
- [ ] Form validation prevents empty title submission
- [ ] Disruption creates incident and auto-analyzes
- [ ] Incident detail shows CMP-201, 500 units, 5-day coverage, 12-day ETA
- [ ] Affected orders table shows PO-5001 (critical), PO-5002 (high), PO-5003 (normal)
- [ ] 4 recovery scenarios displayed with costs, arrival days, policy badges
- [ ] SCN-WAIT shows BLOCKED badge and disabled button
- [ ] SCN-TRANSFER shows AUTO_ALLOWED and residual shortage warning
- [ ] SCN-ALT-SUPPLIER shows APPROVAL_REQUIRED and ₹64,000
- [ ] Selecting SCN-ALT-SUPPLIER creates approval and navigates to queue
- [ ] Approval queue shows pending approval with plan version and cost
- [ ] Approve button shows confirmation dialog before submitting
- [ ] Reject button shows confirmation dialog before submitting
- [ ] After approval, incident status is READY_TO_EXECUTE
- [ ] Execute simulation button appears only when READY_TO_EXECUTE
- [ ] Execute shows confirmation dialog with simulation warning
- [ ] After execution, status is VERIFIED and success notice shows action ID
- [ ] Audit timeline shows all events in chronological order
- [ ] State change details are expandable
- [ ] Audit page is read-only (no edit/delete controls)
- [ ] Navigation deep links work on browser refresh
- [ ] Responsive layout works on mobile (≤700px)
- [ ] API error shows explicit message with retry option
- [ ] 409 conflict shows actionable error message

## Known integration dependencies

- Member 1: `/api/incidents/{id}`, `/api/incidents/{id}/analyze`, `/api/incidents/{id}/select-scenario`, `/api/dashboard/summary`
- Member 2: `/api/disruptions`, `/api/incidents/{id}/impact`
- Member 3: `/api/incidents/{id}/scenarios`
- Member 4: `/api/approvals`, `/api/approvals/{id}/decision`, `/api/actions/{id}/execute`, `/api/incidents/{id}/audit`

If any endpoint is unavailable, set `VITE_DEMO_MODE=true` to use the mock provider.
