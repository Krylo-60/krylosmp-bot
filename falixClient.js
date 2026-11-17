import crypto from "node:crypto";

export const falixBaseUrl = "https://client.falixnodes.net/api/v2";

export function getFalixApiKey() {
  return process.env.FALIX_API_KEY || process.env.FLX_API_KEY;
}

export function requireFalixApiKey() {
  const apiKey = getFalixApiKey();

  if (!apiKey) {
    throw new Error("Missing FALIX_API_KEY.");
  }

  return apiKey;
}

export async function falixRequest(path, options = {}) {
  const apiKey = requireFalixApiKey();
  const response = await fetch(`${falixBaseUrl}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

export function idempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function listServers() {
  return falixRequest("/servers?include=status");
}

export async function getServerStatus(serverId) {
  return falixRequest(`/servers/${encodeURIComponent(serverId)}/status`);
}

export async function sendPowerSignal(serverId, signal) {
  return falixRequest(`/servers/${encodeURIComponent(serverId)}/power`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey(`power-${serverId}-${signal}`)
    },
    body: JSON.stringify({ signal })
  });
}

export async function sendConsoleCommand(serverId, command) {
  return falixRequest(`/servers/${encodeURIComponent(serverId)}/commands`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey(`command-${serverId}`)
    },
    body: JSON.stringify({ command })
  });
}
