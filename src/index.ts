import { createVisitorToken } from "./token";

type AssistantLanguage = "en" | "ar-eg";
type AssistantMode = "text" | "voice";

interface Env {
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  AGENT_NAME?: string;
  ALLOWED_ORIGINS?: string;

  VOICE_API_RATE_LIMITER: RateLimit;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://nexvoraagency.com",
  "https://www.nexvoraagency.com",
];

function getAllowedOrigins(env: Env): Set<string> {
  const configured = env.ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    configured?.length
      ? configured
      : DEFAULT_ALLOWED_ORIGINS,
  );
}

function getCorsOrigin(
  request: Request,
  env: Env,
): string | null {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins(env);

  return allowedOrigins.has(origin) ? origin : null;
}

function securityHeaders(
  headers: Headers,
  corsOrigin?: string | null,
) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  corsOrigin?: string | null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });

  securityHeaders(headers, corsOrigin);

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function getClientKey(request: Request): string {
  // Cloudflare provides the visitor IP in this header.
  // We use it only as a rate-limit key.
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown"
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const corsOrigin = getCorsOrigin(request, env);

    /*
     * CORS preflight
     */
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");

      if (origin && !corsOrigin) {
        return jsonResponse(
          { error: "Origin is not allowed" },
          403,
        );
      }

      const headers = new Headers();

      securityHeaders(headers, corsOrigin);

      return new Response(null, {
        status: 204,
        headers,
      });
    }

    /*
     * Only GET endpoints are exposed.
     */
    if (request.method !== "GET") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        corsOrigin,
      );
    }

    /*
     * Reject browser requests from origins that are not allow-listed.
     */
    const requestOrigin = request.headers.get("Origin");

    if (requestOrigin && !corsOrigin) {
      return jsonResponse(
        { error: "Origin is not allowed" },
        403,
      );
    }

    /*
     * Health check
     */
    if (url.pathname === "/health") {
      return jsonResponse(
        {
          ok: true,
          service: "nexvora-voice-api",
        },
        200,
        corsOrigin,
      );
    }

    /*
     * Token endpoint
     */
    if (url.pathname === "/token") {
      /*
       * Cloudflare native rate limiting.
       *
       * 30 requests / 60 seconds per visitor IP.
       */
      const rateLimitKey = `${getClientKey(request)}:/token`;

      const rateLimitResult =
        await env.VOICE_API_RATE_LIMITER.limit({
          key: rateLimitKey,
        });

      if (!rateLimitResult.success) {
        return jsonResponse(
          {
            error:
              "Too many token requests. Please try again shortly.",
          },
          429,
          corsOrigin,
        );
      }

      const lang = url.searchParams.get("lang");
      const mode = url.searchParams.get("mode");

      if (lang !== "en" && lang !== "ar-eg") {
        return jsonResponse(
          {
            error: "lang must be en or ar-eg",
          },
          400,
          corsOrigin,
        );
      }

      if (mode !== "text" && mode !== "voice") {
        return jsonResponse(
          {
            error: "mode must be text or voice",
          },
          400,
          corsOrigin,
        );
      }

      try {
        const result = await createVisitorToken(env, {
          lang: lang as AssistantLanguage,
          mode: mode as AssistantMode,
        });

        return jsonResponse(
          result,
          200,
          corsOrigin,
        );
      } catch (error) {
        console.error(
          "Voice API request failed:",
          error,
        );

        return jsonResponse(
          {
            error:
              "Voice service is temporarily unavailable.",
          },
          503,
          corsOrigin,
        );
      }
    }

    return jsonResponse(
      {
        error: "Not found",
      },
      404,
      corsOrigin,
    );
  },
} satisfies ExportedHandler<Env>;