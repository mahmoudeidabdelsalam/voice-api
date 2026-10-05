import "dotenv/config";

import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { createVisitorToken, type AssistantLanguage, type AssistantMode } from "./token.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable("x-powered-by");
app.use((_, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  }),
);

app.get("/health", (_request, response) => {
  response.status(200).json({ ok: true, service: "nexvora-voice-api" });
});

app.get(
  "/token",
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many token requests. Please try again shortly." },
  }),
  async (request, response, next) => {
    const origin = request.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: "Origin is not allowed" });
      return;
    }

    const { lang, mode } = request.query;
    if (lang !== "en" && lang !== "ar-eg") {
      response.status(400).json({ error: "lang must be en or ar-eg" });
      return;
    }
    if (mode !== "text" && mode !== "voice") {
      response.status(400).json({ error: "mode must be text or voice" });
      return;
    }

    try {
      const result = await createVisitorToken({
        lang: lang as AssistantLanguage,
        mode: mode as AssistantMode,
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  console.error("Voice API request failed:", error);
  if (response.headersSent) {
    next(error);
    return;
  }
  response.status(503).json({ error: "Voice service is temporarily unavailable." });
};
app.use(errorHandler);

app.listen(port, () => {
  console.info(`NEXVORA voice API listening on port ${port}`);
});
