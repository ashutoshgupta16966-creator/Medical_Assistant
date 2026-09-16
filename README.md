# Medical Assistant

Medical Assistant turns medicine strips, boxes, and lab reports into clear, plain-language guidance with expiry-risk checks, bilingual (English/Hindi) support, medication reminders, and general health chat.

## Features

- **Scan & Vision Analysis**: Upload or capture an image of medicine strips, boxes, or lab reports to analyze with Gemini Vision (`gemini-3.7-flash` or fallback).
- **Expiry Risk Assessment**: Automatic expiry detection categorized into danger (expired / within 7 days), use soon (8–15 days), or safe (>15 days).
- **Bilingual Results (English & Hindi)**: Seamless toggle for all analysis results, usage instructions, dosage notes, disclaimers, and chat guidance.
- **Privacy by Design**: Scans and images remain strictly in browser session memory—no medical images are persisted to external databases.
- **Health Assistant Chat**: Safe, text-based chat for general health guidance, symptoms, and home-care suggestions with built-in red-flag safety disclaimers.
- **Medication Reminders**: Automatic frequency extraction (once/twice/thrice daily) with upcoming dosage schedules.

---

## Getting Started

### Prerequisites

- Node.js 20+ (tested on Node 24)
- pnpm 9+ (`npm install -g pnpm`)
- Google Gemini API key (`GEMINI_API_KEY`)

### Installation

```bash
pnpm install
```

### Local Development

1. **Start the API server** (runs on port 5000):
   ```bash
   pnpm run dev:api
   ```

2. **Start the frontend app** (runs on port 3000, proxies `/api` to 5000):
   ```bash
   pnpm run dev:client
   ```

### Testing & Verification

- Run test suite (Vitest):
  ```bash
  pnpm run test
  ```

- Run typecheck:
  ```bash
  pnpm run typecheck
  ```

- Run production build:
  ```bash
  pnpm run build
  ```

---

## Deployment Guide

### Option 1: Unified Fullstack on Render (Recommended)

Render can build and run both the frontend and backend in a single Web Service.

1. Create a new **Web Service** on [Render](https://render.com) connected to your repository (or use the provided `render.yaml` Blueprint).
2. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `pnpm install --frozen-lockfile && pnpm run build`
   - **Start Command**: `pnpm start`
   - **Health Check Path**: `/api/healthz`
3. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `GEMINI_MODEL`: (Optional) Default is `gemini-3.7-flash`.
   - `NODE_ENV`: `production`

The API server automatically serves the built frontend SPA at `/` and handles all `/api/*` endpoints.

### Option 2: Frontend on Vercel + Backend on Render

If you prefer to deploy the static frontend on Vercel and the Express API on Render:

1. **Backend on Render**:
   - Follow Option 1 above, but set the backend start command to run `pnpm --filter @workspace/api-server start`.
   - Copy your Render backend URL (e.g. `https://medical-assistant-api.onrender.com`).

2. **Frontend on Vercel**:
   - Import your repository into [Vercel](https://vercel.com).
   - Use the root directory with the included `vercel.json`, or set Root Directory to `artifacts/medical-assistant`.
   - Add Environment Variable:
     - `VITE_API_URL`: Set to your Render backend URL (e.g. `https://medical-assistant-api.onrender.com`).
   - Deploy.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (for AI features) | API key for Gemini Vision and Chat |
| `GEMINI_MODEL` | No | Override default model (default: `gemini-3.7-flash`) |
| `PORT` | No | Port for API server (default: `5000`) |
| `VITE_API_URL` | No | Backend base URL for Vercel decoupled frontend |

---

## Project Structure

```
Medical_Assistant/
├── artifacts/
│   ├── api-server/             # Express 5 backend with Gemini Vision & Chat
│   │   ├── src/
│   │   │   ├── routes/         # /api/healthz, /api/scan, /api/chat
│   │   │   ├── app.ts          # Express setup + static SPA serving
│   │   │   └── index.ts        # Server entrypoint
│   └── medical-assistant/      # React + Vite frontend application
│       ├── src/
│       │   ├── components/     # Shell, uploader, error boundary, essential UI
│       │   ├── pages/          # Home, Chat, History, 404
│       │   └── test/           # Vitest test suites
├── lib/
│   ├── api-client-react/       # Generated React Query hooks & custom-fetch
│   ├── api-spec/               # OpenAPI spec source of truth
│   └── api-zod/                # Zod schemas for runtime request/response validation
├── render.yaml                 # Render Blueprint configuration
├── vercel.json                 # Vercel SPA configuration
└── pnpm-workspace.yaml         # Workspace package configuration
```
