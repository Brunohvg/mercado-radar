const apiBase = document.getElementById("apiBase");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
const contextCard = document.getElementById("contextCard");
const analyticsCard = document.getElementById("analyticsCard");
const watchCard = document.getElementById("watchCard");
const watchButton = document.getElementById("watchButton");
const watchStatus = document.getElementById("watchStatus");
const calculatorCard = document.getElementById("calculatorCard");
const marketCard = document.getElementById("marketCard");
const marketRangeBlock = document.getElementById("marketRangeBlock");
const buyBoxBlock = document.getElementById("buyBoxBlock");
const trendsBlock = document.getElementById("trendsBlock");
const calcResult = document.getElementById("calcResult");
const calcStatus = document.getElementById("calcStatus");
const competitiveSimulation = document.getElementById("competitiveSimulation");

let currentItem = null;
let currentMarket = null;
let currentBuyBoxPrice = null;

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
  watchCard.hidden = true;
  watchStatus.textContent = "";
  marketCard.hidden = true;
  calculatorCard.hidden = true;
  calcResult.hidden = true;
  competitiveSimulation.hidden = true;
  currentMarket = null;
  currentBuyBoxPrice = null;
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

  watchCard.hidden = false;
  analyticsCard.hidden = false;

  const catalog = response.body.catalog;
  const trends = Array.isArray(response.body.trends) ? response.body.trends : [];

  marketRangeBlock.innerHTML = "";
  buyBoxBlock.innerHTML = "";
  trendsBlock.innerHTML = "";

  if (catalog?.buyBoxWinner) {
    const winner = catalog.buyBoxWinner;
    currentBuyBoxPrice = winner.price || null;
    const delta =
      winner.price && currentItem.price
        ? ((currentItem.price - winner.price) / winner.price) * 100
        : null;

    buyBoxBlock.innerHTML =
      '<div class="metric"><small>Buy Box</small><strong>' +
      (winner.price ? brl(winner.price) : "—") +
      '</strong><span class="muted">' +
      (winner.logisticType ? winner.logisticType + " · " : "") +
      (winner.freeShipping ? "frete grátis" : "frete não grátis") +
      (delta == null ? "" : " · seu preço " + (delta >= 0 ? "+" : "") + pct(delta)) +
      "</span></div>";
  }

  const marketParams = new URLSearchParams({
    title: currentItem.title,
    itemId: currentItem.id,
    currentPrice: String(currentItem.price || 0),
  });
  if (currentItem.categoryId) {
    marketParams.set("categoryId", currentItem.categoryId);
  }

  const marketResponse = await request(
    "/api/extension/market?" + marketParams.toString(),
  );

  if (marketResponse?.ok && marketResponse.body?.market) {
    currentMarket = marketResponse.body.market;
    const market = currentMarket;
    const competitors = Array.isArray(marketResponse.body.competitors)
      ? marketResponse.body.competitors
      : [];

    marketRangeBlock.innerHTML =
      '<div class="market-range">' +
        '<div><small>P25</small><strong>' + brl(market.p25) + '</strong></div>' +
        '<div><small>Mediana</small><strong>' + brl(market.median) + '</strong></div>' +
        '<div><small>P75</small><strong>' + brl(market.p75) + '</strong></div>' +
      '</div>' +
      '<p class="muted">' +
        market.count + ' comparáveis · seu preço ' +
        (market.gapToMedian == null
          ? 'sem comparação'
          : (market.gapToMedian >= 0 ? '+' : '') + pct(market.gapToMedian) + ' vs mediana') +
      '</p>' +
      (competitors.length
        ? '<div class="divider"></div><div class="title">Concorrentes próximos</div>' +
          competitors.slice(0, 4).map((item) =>
            '<div class="competitor-row"><span>' +
              item.title +
            '</span><strong>' + brl(item.price) + '</strong></div>'
          ).join('')
        : '');
  }

  if (trends.length) {
    trendsBlock.innerHTML =
      '<div class="divider"></div><div class="title">Tendências da categoria</div>' +
      trends
        .slice(0, 6)
        .map((trend, index) =>
          '<div class="mercado-radar-trend"><strong>' +
          (index + 1) +
          ".</strong> " +
          trend.keyword +
          "</div>",
        )
        .join("");
  }

  marketCard.hidden = !(catalog?.buyBoxWinner || trends.length || currentMarket);
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

  const referencePrice =
    currentBuyBoxPrice ||
    (currentMarket?.p25 && currentMarket.p25 > 0 ? currentMarket.p25 : null);

  competitiveSimulation.hidden = true;

  if (referencePrice && Math.abs(referencePrice - currentItem.price) >= 0.01) {
    const competitiveResponse = await request("/api/extension/profitability", {
      method: "POST",
      body: {
        itemId: currentItem.id,
        salePrice: referencePrice,
        supplierPrice,
        discountPercent: Number(document.getElementById("discountPercent").value || 0),
        taxPercent: Number(document.getElementById("taxPercent").value || 0),
        operatingCost: Number(document.getElementById("operatingCost").value || 0),
        targetMarginPercent: Number(document.getElementById("targetMargin").value || 20),
        targetRoiPercent: Number(document.getElementById("targetRoi").value || 30),
        kitQuantity: 1,
      },
    });

    if (competitiveResponse?.ok && competitiveResponse.body?.result) {
      const competitive = competitiveResponse.body.result;
      const source = currentBuyBoxPrice ? "Buy Box" : "P25 do mercado";

      competitiveSimulation.innerHTML =
        '<strong>Se competir em ' + brl(referencePrice) + '</strong>' +
        '<div class="muted">Referência: ' + source +
        ' · lucro ' + brl(competitive.profit) +
        ' · margem ' + pct(competitive.marginPercent) +
        ' · ROI ' + pct(competitive.roiPercent) + '</div>' +
        '<div class="' +
          (competitive.verdict === "GOOD" ? "good" : competitive.verdict === "BAD" ? "bad" : "") +
        '" style="margin-top:5px;font-weight:700">' +
          (competitive.verdict === "GOOD"
            ? "Você consegue competir sem romper suas metas."
            : competitive.verdict === "TIGHT"
              ? "Competir nesse preço deixa a operação apertada."
              : "Não recomendamos acompanhar esse preço com o custo informado.") +
        '</div>';

      competitiveSimulation.hidden = false;
    }
  }

  calcResult.hidden = false;
});


watchButton.addEventListener("click", async () => {
  if (!currentItem?.id) return;

  watchButton.disabled = true;
  watchStatus.textContent = "Salvando no monitoramento...";

  const context = await chrome.storage.session.get(["radarCurrentContext"]);
  const response = await request("/api/extension/watchlist", {
    method: "POST",
    body: {
      itemId: currentItem.id,
      referenceId: context.radarCurrentContext?.referenceId || currentItem.id,
    },
  });

  watchButton.disabled = false;

  if (!response?.ok) {
    watchStatus.textContent =
      response?.body?.error || "Não foi possível monitorar este anúncio.";
    watchStatus.className = "muted bad";
    return;
  }

  watchStatus.textContent =
    "Monitoramento ativado. O produto já está salvo no Radar.";
  watchStatus.className = "muted good";
  watchButton.textContent = "Monitorando";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.radarCurrentContext) {
    renderContext(changes.radarCurrentContext.newValue);
  }
});

loadSettings();
refreshContext();
