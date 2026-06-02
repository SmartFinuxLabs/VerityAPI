# VerityAPI

Starter API service for the Verity platform.

## Stack

- Node.js 20+
- TypeScript
- Express

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

The API will start on `http://0.0.0.0:8080` by default.

## Environment Ownership

Supabase configuration is owned by `VerityAPI` only. `VerityUI` should call API endpoints and must not receive Supabase URL, anon key, or service-role values in browser environment variables.

Required server-side Supabase values for API-mode reads and authenticated domain writes:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional admin/service-role value for trusted backend-only writes, migrations, seeded integration tests, and privileged RPC execution:

- `SUPABASE_SERVICE_ROLE_KEY`

## Scripts

- `npm run dev`: Run development server with watch mode
- `npm run build`: Compile TypeScript into `dist/`
- `npm run start`: Run compiled server
- `npm test`: Run Jest/Supertest API tests with coverage
- `npm run test:watch`: Run Jest in watch mode
- `npm run typecheck`: TypeScript checks without emitting files

## Deploy To Vercel

This project is configured for Vercel serverless deployment using:

- `vercel.json` for runtime and routing
- `api/index.js` as the Vercel function entrypoint

Deployment notes:

1. Set Vercel project root to `VerityAPI/`.
2. Keep the default build command (`npm run build`) so `dist/` is generated.
3. Add required environment variables in Vercel:
	- `SUPABASE_URL`
	- `SUPABASE_ANON_KEY`
	- Optional but recommended for admin paths: `SUPABASE_SERVICE_ROLE_KEY`
	- Optional: `API_BASE_PATH` (defaults to `/api/v1`)

After deployment:

- Root status endpoint: `GET /`
- Health endpoint: `GET /api/v1/health`

## Test Auth Tokens

Until Supabase token validation is wired, tests and local contract checks use deterministic bearer tokens:

```text
Authorization: Bearer test:<user-id>:<participant-role>:<organization-role>
```

Example:

```text
Authorization: Bearer test:user-1:SUPPLIER:MEMBER
```

## Endpoint Groups

- `GET /`: Service status
- `GET /api/v1/health`: Health check
- `/api/v1/organizations/*`: Phase 1 onboarding and organization access
- `/api/v1/organization-invitations/*`: Organization and supplier invitation lifecycle
- `/api/v1/relationships/*`: Buyer-supplier relationships, invoice mode, and risk profile
- `/api/v1/invoices/*`: Invoice intake, buyer resolution, deterministic hash, and financeability
- `/api/v1/financeability/*`: Funding offer creation
- `/api/v1/offers/*`: Investor commitments
- `/api/v1/commitments/*`: Settlement instruction creation
- `/api/v1/settlement/*`: Settlement status and reconciliation
- `/api/v1/audit/*`: Audit event query surface

Phase 1 contract routes currently return contract-compliant `501` stubs until their service and repository implementations are wired.

## Structure

```text
src/
	app.ts                    # Express app wiring
	server.ts                 # Process entrypoint
	config/
		env.ts                  # Environment loading and defaults
	contracts/
		phase1.ts               # Phase 1 enum and reason-code baseline
	errors/
		api-error.ts            # Contract-compliant API errors
	middleware/
		correlation-id.ts       # X-Correlation-Id propagation
		error-handler.ts        # Centralized error handler
		not-found.ts            # Contract-compliant 404s
	routes/
		index.ts                # API route registration
		health.ts               # Health route
		*.ts                    # Phase 1 route groups
```
