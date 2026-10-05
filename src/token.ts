import { randomUUID } from "node:crypto";
import { AccessToken, LiveKitAPI } from "livekit-server-sdk";

export type AssistantLanguage = "en" | "ar-eg";
export type AssistantMode = "text" | "voice";

type TokenRequest = {
  lang: AssistantLanguage;
  mode: AssistantMode;
};

function getLiveKitCredentials() {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!url || !url.startsWith("wss://") || !apiKey || !apiSecret) {
    throw new Error("LiveKit service configuration is incomplete");
  }

  return {
    url,
    apiKey,
    apiSecret,
  };
}

export async function createVisitorToken({
  lang,
  mode,
}: TokenRequest) {
  const { url, apiKey, apiSecret } = getLiveKitCredentials();

  const room = `nexvora-${randomUUID()}`;
  const identity = `visitor-${randomUUID()}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "10m",
    metadata: JSON.stringify({
      lang,
      mode,
    }),
  });

  token.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: mode === "voice",
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  // LiveKit browser connection URL:
  // wss://project.livekit.cloud
  //
  // LiveKit Server API URL:
  // https://project.livekit.cloud
  const apiHost = url.replace(/^wss:\/\//, "https://");

  const livekit = new LiveKitAPI({
    host: apiHost,
    apiKey,
    secret: apiSecret,
  });

  const agentName =
    process.env.AGENT_NAME?.trim() || "nexvora-assistant";

  await livekit.agentDispatch.createDispatch(room, agentName, {
    metadata: JSON.stringify({
      lang,
      mode,
    }),
  });

  return {
    url,
    token: jwt,
  };
}