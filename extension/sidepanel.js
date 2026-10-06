const apiBase = document.getElementById("apiBase");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
const contextCard = document.getElementById("contextCard");
const analyticsCard = document.getElementById("analyticsCard");
const calculatorCard = document.getElementById("calculatorCard");
const calcResult = document.getElementById("calcResult");
const calcStatus = document.getElementById("calcStatus");

let currentItem = null;

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  }) + "%";
}

async function request(path, options = {}) {
  return chrome.runtime.sendMessage({
    type: "RADAR_FETCH",
    path,
    method: options.method || "GET",
    body: options.body,
  });
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(["radarApiBase", "radarApiKey"]);
  apiBase.value = settings.radarApiBase || "https://radar.optarys.com.br";
  apiKey.value = settings.radarApiKey || "";
}

async function renderContext(context) {
  currentItem = null;
  analyticsCard.hidden = true;
  calculatorCard.hidden = true;
  calcResult.hidden = true;
  calcStatus.textContent = "";

  if (!context?.referenceId) {
    contextCard.innerHTML =
      '<div class="title">Anúncio atual</div>' +
      '<p class="muted">Abra um anúncio do Mercado Livre para carregar a análise.</p>';
    return;
  }

  contextCard.innerHTML =
    '<div class="title">Anúncio atual</div>' +
    '<div class="product-title">' +
      (context.title || context.referenceId) +
    '</div>' +
    '<p class="muted">Carregando dados do Radar...</p>';

  const params = new URLSearchParams({ id: context.referenceId });
  if (context.visiblePrice) {
    params.set("visiblePrice", String(context.visiblePrice));
  }

  const response = await request("/api/extension/item?" + params.toString());

  if (!response?.ok || !response.body?.item) {
    contextCard.innerHTML =
      '<div class="title">Anúncio atual</div>' +
      '<div class="product-title">' +
        (context.title || context.referenceId) +
      '</div>' +
      '<p class="error">' +
        (response?.body?.error || "Não foi possível analisar este anúncio.") +
      "</p>";
    return;
  }

  currentItem = response.body.item;
  const intel = currentItem.intelligence || {};

  contextCard.innerHTML =
    '<div class="title">Anúncio atual</div>' +
    '<div class="product-title">' + currentItem.title + "</div>" +
    '<div class="grid">' +
      '<div class="metric"><small>Preço</small><strong>' + brl(currentItem.price) + "</strong></div>" +
      '<div class="metric"><small>Tipo</small><strong>' +
        (currentItem.listingTypeId === "gold_pro" ? "Premium" : "Clássico") +
      "</strong></div>" +
    "</div>" +
    '<p class="muted">' +
      (currentItem.freeShipping ? "Frete grátis · " : "") +
      (currentItem.userProductId ? "User Product " + currentItem.userProductId : "Item " + currentItem.id) +
    "</p>";

  document.getElementById("score").textContent = (intel.score ?? 0) + "/100";
  document.getElementById("demand").textContent = intel.demandLabel || "—";
  document.getElementById("salesMonth").textContent =
    intel.salesPerMonth == null ? "—" : "~" + Math.round(intel.salesPerMonth);
  document.getElementById("revenueMonth").textContent =
    intel.revenuePerMonth == null ? "—" : brl(intel.revenuePerMonth);
  document.getElementById("sold").textContent = currentItem.soldQuantity ?? "—";
  document.getElementById("age").textContent =
    intel.ageDays == null ? "—" : intel.ageDays + " dias";

  analyticsCard.hidden = false;
  calculatorCard.hidden = false;
}

async function refreshContext() {
  const data = await chrome.storage.session.get(["radarCurrentContext"]);
  await renderContext(data.radarCurrentContext);
}

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      radarApiBase: apiBase.value.trim() || "https://radar.optarys.com.br",
      radarApiKey: apiKey.value.trim(),
    },
    () => {
      status.textContent = "Configuração salva.";
      refreshContext();
    },
  );
});

document.getElementById("calculate").addEventListener("click", async () => {
  if (!currentItem?.id) return;

  const supplierPrice = Number(document.getElementById("supplierPrice").value || 0);
  if (supplierPrice < 0) return;

  calcStatus.textContent = "Calculando comissão, frete e rentabilidade...";
  calcResult.hidden = true;

  const response = await request("/api/extension/profitability", {
    method: "POST",
    body: {
      itemId: currentItem.id,
      supplierPrice,
      discountPercent: Number(document.getElementById("discountPercent").value || 0),
      taxPercent: Number(document.getElementById("taxPercent").value || 0),
      operatingCost: Number(document.getElementById("operatingCost").value || 0),
      targetMarginPercent: Number(document.getElementById("targetMargin").value || 20),
      targetRoiPercent: Number(document.getElementById("targetRoi").value || 30),
      kitQuantity: 1,
    },
  });

  if (!response?.ok || !response.body?.result) {
    calcStatus.textContent =
      response?.body?.error || "Não foi possível calcular a rentabilidade.";
    return;
  }

  const result = response.body.result;
  const fees = response.body.fees;

  document.getElementById("profit").textContent = brl(result.profit);
  document.getElementById("margin").textContent = pct(result.marginPercent);
  document.getElementById("roi").textContent = pct(result.roiPercent);
  document.getElementById("minPrice").textContent = brl(result.minimumSuggestedPrice);
  document.getElementById("fees").textContent =
    "Comissão " + pct(fees.commissionPercent) +
    " · tarifa fixa " + brl(fees.fixedFee) +
    " · frete " + brl(fees.shippingCost) +
    " · imposto " + brl(fees.taxAmount);

  calcStatus.textContent =
    result.verdict === "GOOD"
      ? "Conta saudável para as metas informadas."
      : result.verdict === "TIGHT"
        ? "A conta fecha, mas está apertada."
        : "A conta não fecha nas metas atuais.";

  calcStatus.className =
    "muted " + (result.verdict === "GOOD" ? "good" : result.verdict === "BAD" ? "bad" : "");

  calcResult.hidden = false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.radarCurrentContext) {
    renderContext(changes.radarCurrentContext.newValue);
  }
});

loadSettings();
refreshContext();
