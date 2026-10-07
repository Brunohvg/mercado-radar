chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

const DEFAULT_API_BASE = "https://radar.optarys.com.br";

function base64Url(bytes) {
  let binary = "";
  const values = new Uint8Array(bytes);
  for (const byte of values) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomVerifier(bytes = 48) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value);
  return base64Url(await crypto.subtle.digest("SHA-256", data));
}

async function getApiBase() {
  const settings = await chrome.storage.sync.get(["radarApiBase"]);
  return settings.radarApiBase || DEFAULT_API_BASE;
}

async function getDeviceId() {
  const stored = await chrome.storage.local.get(["radarDeviceId"]);
  if (stored.radarDeviceId) return stored.radarDeviceId;

  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ radarDeviceId: deviceId });
  return deviceId;
}

async function authTokens() {
  return chrome.storage.local.get([
    "radarAccessToken",
    "radarAccessTokenExpiresAt",
    "radarRefreshToken",
  ]);
}

async function saveTokens(payload) {
  await chrome.storage.local.set({
    radarAccessToken: payload.access_token,
    radarAccessTokenExpiresAt:
      Date.now() + Number(payload.expires_in || 0) * 1000,
    radarRefreshToken: payload.refresh_token,
  });
}

async function clearTokens() {
  await chrome.storage.local.remove([
    "radarAccessToken",
    "radarAccessTokenExpiresAt",
    "radarRefreshToken",
  ]);
}

async function refreshAccessToken() {
  const base = await getApiBase();
  const tokens = await authTokens();
  if (!tokens.radarRefreshToken) return null;

  const response = await fetch(base + "/api/extension/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.radarRefreshToken,
      device_id: await getDeviceId(),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    await clearTokens();
    return null;
  }

  await saveTokens(body);
  return body.access_token;
}

async function currentAccessToken() {
  const tokens = await authTokens();

  if (
    tokens.radarAccessToken &&
    Number(tokens.radarAccessTokenExpiresAt || 0) > Date.now() + 30_000
  ) {
    return tokens.radarAccessToken;
  }

  return refreshAccessToken();
}

async function doFetch(message, accessToken) {
  const base = await getApiBase();
  const headers = {
    ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
    ...(message.body ? { "content-type": "application/json" } : {}),
  };

  const response = await fetch(base + message.path, {
    method: message.method || "GET",
    headers,
    body: message.body ? JSON.stringify(message.body) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function radarRequest(message) {
  let token = await currentAccessToken();

  if (!token) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "AUTH_REQUIRED",
        message: "Entre no Mercado Radar para usar a extensão.",
      },
    };
  }

  let response = await doFetch(message, token);

  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) response = await doFetch(message, token);
  }

  return response;
}

async function login() {
  const base = await getApiBase();
  const redirectUri = chrome.identity.getRedirectURL("radar-auth");
  const state = randomVerifier(24);
  const verifier = randomVerifier(48);
  const challenge = await sha256Base64Url(verifier);
  const deviceId = await getDeviceId();

  const url = new URL(base + "/api/extension/auth/start");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("device_id", deviceId);
  url.searchParams.set("device_name", "Chrome");

  const callback = await chrome.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive: true,
  });

  if (!callback) throw new Error("Login cancelado.");

  const returned = new URL(callback);
  if (returned.searchParams.get("state") !== state) {
    throw new Error("Estado de autenticação inválido.");
  }

  const authError = returned.searchParams.get("error");
  if (authError) {
    throw new Error("Mercado Livre não concluiu o login: " + authError);
  }

  const code = returned.searchParams.get("code");
  if (!code) throw new Error("Código de autenticação não recebido.");

  const tokenResponse = await fetch(base + "/api/extension/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });

  const body = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !body.access_token) {
    throw new Error(body.error || "Falha ao criar sessão da extensão.");
  }

  await saveTokens(body);
  return authStatus();
}

async function authStatus() {
  const token = await currentAccessToken();
  if (!token) return { authenticated: false };

  const response = await doFetch(
    { path: "/api/extension/auth/session", method: "GET" },
    token,
  );

  if (!response.ok) {
    if (response.status === 401) await clearTokens();
    return {
      authenticated: false,
      error: response.body?.error || null,
    };
  }

  return response.body;
}

async function logout() {
  const token = await currentAccessToken();
  if (token) {
    await doFetch(
      { path: "/api/extension/auth/logout", method: "POST" },
      token,
    ).catch(() => null);
  }

  await clearTokens();
  return { authenticated: false };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RADAR_FETCH") {
    radarRequest(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          status: 0,
          body: {
            error: error instanceof Error ? error.message : "Falha de rede.",
          },
        });
      });
    return true;
  }

  if (message?.type === "RADAR_AUTH_LOGIN") {
    login()
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          authenticated: false,
          error: error instanceof Error ? error.message : "Falha no login.",
        }),
      );
    return true;
  }

  if (message?.type === "RADAR_AUTH_STATUS") {
    authStatus().then(sendResponse);
    return true;
  }

  if (message?.type === "RADAR_AUTH_LOGOUT") {
    logout().then(sendResponse);
    return true;
  }

  if (message?.type === "RADAR_CONTEXT_UPDATE") {
    chrome.storage.session.set({ radarCurrentContext: message.context || null });
    sendResponse({ ok: true });
    return false;
  }
});
