import { AccessToken, LiveKitAPI } from "livekit-server-sdk";

export type AssistantLanguage = "en" | "ar-eg";
export type AssistantMode = "text" | "voice";

type TokenRequest = {
  lang: AssistantLanguage;
  mode: AssistantMode;
};

interface Env {
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  AGENT_NAME?: string;
}

function getLiveKitCredentials(env: Env) {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();

  if (
    !url ||
    !url.startsWith("wss://") ||
    !apiKey ||
    !apiSecret
  ) {
    throw new Error(
      "LiveKit service configuration is incomplete",
    );
  }

  return {
    url,
    apiKey,
    apiSecret,
  };
}

export async function createVisitorToken(
  env: Env,
  {
    lang,
    mode,
  }: TokenRequest,
) {
  const {
    url,
    apiKey,
    apiSecret,
  } = getLiveKitCredentials(env);

  const room =
    `nexvora-${crypto.randomUUID()}`;

  const identity =
    `visitor-${crypto.randomUUID()}`;

  const token = new AccessToken(
    apiKey,
    apiSecret,
    {
      identity,
      ttl: "10m",
      metadata: JSON.stringify({
        lang,
        mode,
      }),
    },
  );

  token.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: mode === "voice",
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  /*
   * LiveKit Server API requires HTTPS.
   *
   * Browser/client connection:
   *   wss://project.livekit.cloud
   *
   * Server API:
   *   https://project.livekit.cloud
   */
  const apiHost = url.replace(
    /^wss:\/\//,
    "https://",
  );

  const livekit = new LiveKitAPI({
    host: apiHost,
    apiKey,
    secret: apiSecret,
  });

  const agentName =
    env.AGENT_NAME?.trim() ||
    "nexvora-assistant";

  await livekit.agentDispatch.createDispatch(
    room,
    agentName,
    {
      metadata: JSON.stringify({
        lang,
        mode,
      }),
    },
  );

  return {
    url,
    token: jwt,
  };
}