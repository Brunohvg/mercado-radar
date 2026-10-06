chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function radarRequest(message) {
  const settings = await chrome.storage.sync.get(["radarApiBase", "radarApiKey"]);
  const base = settings.radarApiBase || "https://radar.optarys.com.br";
  const headers = {
    ...(settings.radarApiKey
      ? { "x-radar-extension-key": settings.radarApiKey }
      : {}),
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

  if (message?.type === "RADAR_CONTEXT_UPDATE") {
    chrome.storage.session.set({ radarCurrentContext: message.context || null });
    sendResponse({ ok: true });
    return false;
  }
});
