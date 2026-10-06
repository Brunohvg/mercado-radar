chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RADAR_FETCH") {
    chrome.storage.sync.get(["radarApiBase", "radarApiKey"], async (settings) => {
      try {
        const base = settings.radarApiBase || "https://radar.optarys.com.br";
        const response = await fetch(base + message.path, {
          headers: settings.radarApiKey
            ? { "x-radar-extension-key": settings.radarApiKey }
            : undefined,
        });
        const body = await response.json();
        sendResponse({ ok: response.ok, status: response.status, body });
      } catch (error) {
        sendResponse({
          ok: false,
          status: 0,
          body: { error: error instanceof Error ? error.message : "Falha de rede." },
        });
      }
    });
    return true;
  }
});
