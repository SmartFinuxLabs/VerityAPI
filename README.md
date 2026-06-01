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

## Scripts

- `npm run dev`: Run development server with watch mode
- `npm run build`: Compile TypeScript into `dist/`
- `npm run start`: Run compiled server
- `npm run typecheck`: TypeScript checks without emitting files

## Endpoints

- `GET /`: Service status
- `GET /api/v1/health`: Health check

## Structure

```text
src/
	app.ts                    # Express app wiring
	server.ts                 # Process entrypoint
	config/
		env.ts                  # Environment loading and defaults
	middleware/
		error-handler.ts        # Centralized error handler
	routes/
		index.ts                # API route registration
		health.ts               # Health route
```
