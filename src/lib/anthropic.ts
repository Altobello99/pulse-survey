import Anthropic from "@anthropic-ai/sdk";

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";
const AI_GATEWAY_MODEL = "anthropic/claude-sonnet-4.6";
const DIRECT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export function getAnthropicClient(explicitGatewayToken?: string) {
  const gatewayCredential = explicitGatewayToken
    || process.env.AI_GATEWAY_API_KEY
    || process.env.VERCEL_OIDC_TOKEN;

  if (gatewayCredential) {
    return {
      client: new Anthropic({
        apiKey: gatewayCredential,
        baseURL: AI_GATEWAY_BASE_URL,
      }),
      model: process.env.ANTHROPIC_MODEL || AI_GATEWAY_MODEL,
    };
  }

  const directApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!directApiKey?.startsWith("sk-ant-")) {
    throw new Error("No valid AI Gateway or Anthropic credential is configured");
  }

  return {
    client: new Anthropic({ apiKey: directApiKey }),
    model: process.env.ANTHROPIC_MODEL || DIRECT_ANTHROPIC_MODEL,
  };
}
