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
  // The origin is bundled by the installer for this deployment, never entered
  // by the seller or read from Chrome's synced preferences. This also repairs
  // stale addresses (for example 0.0.0.0:3000) from older builds.
  const url = new URL(DEFAULT_API_BASE);
  const local = url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new Error("O endereço do Radar nesta extensão é inválido. Reinstale pelo painel Radar.");
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
  if (!tokens.radarAuthOrigin || tokens.radarAuthOrigin !== (await getApiBase())) {
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
    !/^\/api\/extension\/(?:item|items|market|observations|profitability|search-profitability|search|watchlist|publication-capabilities)(?:[?]|$)/.test(
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
  await chrome.storage.session.set({
    radarPendingLink: { state, verifier, redirectUri, issuedAt: Date.now() },
  });
  const url = new URL(base + "/extensao/conectar");
  url.searchParams.set("extension_id", chrome.runtime.id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  url.searchParams.set("device_id", deviceId);
  try {
    await chrome.tabs.create({ url: url.toString(), active: true });
  } catch (error) {
    await chrome.storage.session.remove("radarPendingLink");
    throw error;
  }
  return { authenticated: false, pending: true,
    message: "Uma aba do Radar foi aberta. Autorize a extensão nessa aba." };
}

async function finishBrowserLink(message, sender) {
  const base = await getApiBase();
  if (!sender.url || new URL(sender.url).origin !== base) {
    throw new Error("Origem de vinculação não autorizada.");
  }
  const stored = await chrome.storage.session.get(["radarPendingLink"]);
  const pending = stored.radarPendingLink;
  if (!pending || Date.now() - pending.issuedAt > 5 * 60 * 1000 ||
      message.state !== pending.state || message.redirectUri !== pending.redirectUri ||
      typeof message.code !== "string" || message.code.length < 20) {
    throw new Error("Vinculação expirada ou não solicitada neste navegador.");
  }
  await chrome.storage.session.remove("radarPendingLink");
  const response = await fetch(base + "/api/extension/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code", code: message.code,
      code_verifier: pending.verifier, redirect_uri: pending.redirectUri,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error || "A vinculação da extensão não foi concluída.");
  }
  await saveTokens(payload);
  return { ok: true };
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
  await chrome.storage.session.remove([
    "radarComparisonTarget",
    "radarPanelIntent",
  ]);
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
    if (
      !sender.tab?.id ||
      !/^https:\/\/([a-z0-9-]+\.)*mercadolivre\.com\.br\//i.test(
        sender.url || "",
      )
    ) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(async () => {
        // A single-use UI intent; page observations still come from the active tab.
        await chrome.storage.session.set({
          radarPanelIntent: {
            id: crypto.randomUUID(),
            tabId: sender.tab.id,
            issuedAt: Date.now(),
            tab: ["summary", "calculator", "market", "connection"].includes(
              message.tab,
            )
              ? message.tab
              : "summary",
            referenceId: /^MLB(?:U)?\d{5,}$/.test(message.referenceId || "")
              ? message.referenceId
              : null,
            selectedIds: Array.isArray(message.selectedIds)
              ? [
                  ...new Set(
                    message.selectedIds.filter(
                      (id) =>
                        typeof id === "string" && /^MLB(?:U)?\d{5,}$/.test(id),
                    ),
                  ),
                ].slice(0, 60)
              : [],
          },
        });
        sendResponse({ ok: true });
      })
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

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "RADAR_BROWSER_LINK") return false;
  finishBrowserLink(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false,
      error: error instanceof Error ? error.message : "Falha na vinculação." }));
  return true;
});
