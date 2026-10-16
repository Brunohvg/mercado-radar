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
  const raw = settings.radarApiBase || DEFAULT_API_BASE;
  const url = new URL(raw);
  if (
    url.origin !== DEFAULT_API_BASE &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error(
      "URL da API inválida. Use o Radar ou um servidor local de desenvolvimento.",
    );
  return url.origin;
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
    "radarAuthOrigin",
  ]);
}

async function saveTokens(payload) {
  await chrome.storage.local.set({
    radarAuthOrigin: await getApiBase(),
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
    "radarAuthOrigin",
  ]);
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const base = await getApiBase();
    const tokens = await authTokens();
    if (!tokens.radarRefreshToken) return null;

    const response = await fetch(base + "/api/extension/auth/refresh", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: tokens.radarRefreshToken,
        device_id: await getDeviceId(),
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      if ([400, 401, 403].includes(response.status)) await clearTokens();
      return null;
    }

    await saveTokens(body);
    return body.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function currentAccessToken() {
  const tokens = await authTokens();
  if ((tokens.radarAuthOrigin || DEFAULT_API_BASE) !== (await getApiBase())) {
    await clearTokens();
    return null;
  }

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
    signal: AbortSignal.timeout(25000),
    headers,
    body: message.body ? JSON.stringify(message.body) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function radarRequest(message) {
  if (
    !/^\/api\/extension\/(?:item|items|market|observations|profitability|search-profitability|search|watchlist)(?:[?]|$)/.test(
      message.path || "",
    ) ||
    !["GET", "POST", "DELETE"].includes(message.method || "GET")
  )
    throw new Error("Consulta não permitida pela extensão.");
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

  const profile = response.body;
  const stored = await chrome.storage.sync.get([
    "radarPreferencesWorkspace",
    "radarPreferencesUpdatedAt",
  ]);
  if (
    profile.preferences &&
    (stored.radarPreferencesWorkspace !== profile.workspaceId ||
      stored.radarPreferencesUpdatedAt !== profile.preferences.updatedAt)
  ) {
    await chrome.storage.sync.set({
      radarPreferencesWorkspace: profile.workspaceId,
      radarPreferencesUpdatedAt: profile.preferences.updatedAt,
      radarTaxPercent: profile.preferences.taxPercent,
      radarOperatingCost: profile.preferences.operatingCost,
      radarTargetMarginPercent: profile.preferences.targetMarginPercent,
      radarTargetRoiPercent: profile.preferences.targetRoiPercent,
    });
    if (stored.radarPreferencesWorkspace !== profile.workspaceId)
      await chrome.storage.sync.remove(["radarShippingEstimate"]);
  }
  return profile;
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
  await chrome.storage.session.remove(["radarComparisonTarget"]);
  await chrome.storage.sync.remove([
    "radarTaxPercent",
    "radarOperatingCost",
    "radarShippingEstimate",
    "radarPreferencesWorkspace",
    "radarPreferencesUpdatedAt",
  ]);
  return { authenticated: false };
}

async function activeContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const context = await chrome.tabs.sendMessage(tab.id, {
      type: "RADAR_READ_CONTEXT",
    });
    return context ? { ...context, tabId: tab.id } : null;
  } catch {
    return null;
  } // Do not reuse a context from another or navigated tab.
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === "RADAR_OPEN_PANEL") {
    if (!sender.tab?.id) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "RADAR_CONTEXT_GET") {
    activeContext()
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }
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
    authStatus()
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          authenticated: false,
          error: error.message || "Falha de conexão.",
        }),
      );
    return true;
  }

  if (message?.type === "RADAR_AUTH_LOGOUT") {
    logout()
      .then(sendResponse)
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  if (message?.type === "RADAR_CONTEXT_UPDATE") {
    if (
      !sender.tab?.id ||
      !/^https:\/\/([a-z0-9-]+\.)*mercadolivre\.com\.br\//i.test(
        sender.url || "",
      )
    ) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage.session
      .set({
        ["radarContext:" + sender.tab.id]: {
          ...message.context,
          tabId: sender.tab.id,
        },
      })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((id) => {
  void chrome.storage.session.remove("radarContext:" + id);
});
