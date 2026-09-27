/**
 * Vercel Serverless Function — API handler
 *
 * This file exposes the Express app as a Vercel serverless function.
 * Vercel routes all `/api/**` requests here (see vercel.json).
 *
 * Environment variables required (set in Vercel Project Settings → Environment):
 *   GEMINI_API_KEY  — Google Generative AI key
 *   GEMINI_MODEL    — (optional) override primary model, default: gemini-3.7-flash
 */

import app from "../artifacts/api-server/src/app.js";

export default app;
