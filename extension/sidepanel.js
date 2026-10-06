const apiBase = document.getElementById("apiBase");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.sync.get(["radarApiBase", "radarApiKey"], (settings) => {
  apiBase.value = settings.radarApiBase || "https://radar.optarys.com.br";
  apiKey.value = settings.radarApiKey || "";
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      radarApiBase: apiBase.value.trim() || "https://radar.optarys.com.br",
      radarApiKey: apiKey.value.trim(),
    },
    () => {
      status.textContent = "Configuração salva.";
    },
  );
});
