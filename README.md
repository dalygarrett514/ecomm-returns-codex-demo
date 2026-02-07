# Returns Intelligence Console — lululemon Demo (Codex Hackathon)

React + Express + PostgreSQL demo showing how Codex turns returns into actionable retail intelligence.

## What this demo proves

1. You can quickly build a production-style app with Codex.
2. You can embed Codex programmatically in backend workflows.

## Core capabilities

- Auth0 RBAC with role-specific interfaces:
  - `customer`: browse orders, submit returns, view return status
  - `merchant`: analytics dashboard, product issue deep dive, Codex insights, action items
- PostgreSQL persistence for:
  - orders, order_items, returns, products, merchants
  - AI return analysis (`return_ai_analysis`)
  - AI insights + recommendations (`ai_insights`)
  - execution-ready tasks (`action_items`)
- Three explicit Codex integration points:
  - Return analysis on every submission (`analyzeReturnReason`)
  - Pattern detection for product-level issues (`detectPatterns`)
  - Recommendation + ROI generation (`generateRecommendations`)
- Merchant UX highlights:
  - Product issues list with severity indicator
  - Interactive returns trend chart
  - Insight modal with What-if savings + Codex Decision Trace
  - Action items with Codex-composed impact notes on completion
- Customer UX highlights:
  - Return modal flow (reason only, Codex auto-categorizes)
  - In-transit orders are not eligible for returns

## Tech stack

- Frontend: React (Create React App)
- Backend: Express
- Auth: Auth0 + JWT verification + RBAC
- DB: PostgreSQL (`pg`)
- AI: OpenAI SDK using configurable Codex model

## Project layout

- `/src`: React app with role-based UI
- `/server`: API, auth middleware, Codex services, tests
- `/server/db/schema.sql`: DB schema
- `/server/tests`: meaningful backend tests
  - `categorization.test.js`
  - `insights.test.js`
  - `recommendations.test.js`
  - `rbac.test.js`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Start PostgreSQL and create database (example `ecomm_returns`).
4. Run schema and optional seed:
   ```bash
   npm run migrate
   npm run seed
   ```
5. Start API and frontend in separate terminals:
   ```bash
   npm run server
   npm start
   ```

## Auth0 RBAC setup

Use Auth0 roles `customer` and `merchant`.

- Include roles in access token under custom claim:
  - `https://ecomm-demo.example.com/roles`
- For merchant users, include merchant id claim:
  - `https://ecomm-demo.example.com/merchant_id`

Local fallback mode is enabled with `AUTH_DISABLED=true` to demo both roles without Auth0 credentials.

## Programmatic Codex points (critical)

- `POST /api/customer/returns`
  - calls `analyzeReturnReason`
  - stores category/sentiment/severity/confidence + summary
- `POST /api/merchant/products/:productId/generate-insight`
  - calls `detectPatterns`
  - calls `generateRecommendations`
  - stores insights + recommendations with estimated impact
- `PATCH /api/merchant/action-items/:actionItemId`
  - on completion, Codex generates an impact note (non-blocking)
- automatic best-effort insight refresh after return submission when threshold is met

## Tests (3-5 meaningful cases)

Run:
```bash
npm run test:server
```

Current tests:
- `categorization.test.js`: return reason categorization behavior
- `insights.test.js`: pattern detection synthesis and priority logic
- `recommendations.test.js`: recommendation parsing/normalization
- `rbac.test.js`: protected route role enforcement

## Key API routes

Customer:
- `GET /api/customer/orders`
- `GET /api/customer/returns`
- `POST /api/customer/returns`

Merchant:
- `GET /api/merchant/dashboard`
- `GET /api/merchant/products?sortBy=mostReturns|costImpact|newestIssues`
- `GET /api/merchant/products/:productId`
- `POST /api/merchant/products/:productId/generate-insight`
- `GET /api/merchant/action-items`
- `PATCH /api/merchant/action-items/:actionItemId`

## Notes

- Set `OPENAI_API_KEY` in `.env` to enable live Codex calls.
- Without API key, deterministic fallbacks keep demo flows functional.
