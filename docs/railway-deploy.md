# Railway Deployment (MVP)

## Runtime
- Framework: Fastify (Node.js)
- Start command: `npm start`
- Health check path: `/healthz`

## Required environment variables
- `PORT` (provided by Railway automatically)
- `HOST=0.0.0.0` (optional; app defaults to `0.0.0.0`)

## Deploy steps (minimum)
1. Create a new Railway project and connect this GitHub repository.
2. Ensure the service uses the repo root as the working directory.
3. Railway will install dependencies and run the start command from `railway.json`.
4. Confirm health check passes at `/healthz`.
5. Open `/` to verify the landing page renders.

## Notes
- The app serves the landing page from `public/landing.html` and `public/landing.css`.
- MVP endpoints remain available under `/v1/*` and `/api/*`.
