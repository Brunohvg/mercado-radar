const apiBase = document.getElementById("apiBase");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
const contextCard = document.getElementById("contextCard");
const analyticsCard = document.getElementById("analyticsCard");
const watchCard = document.getElementById("watchCard");
const watchButton = document.getElementById("watchButton");
const watchStatus = document.getElementById("watchStatus");
const calculatorCard = document.getElementById("calculatorCard");
const myOperationCard = document.getElementById("myOperationCard");
const myOperationBlock = document.getElementById("myOperationBlock");
const marketCard = document.getElementById("marketCard");
const marketRangeBlock = document.getElementById("marketRangeBlock");
const buyBoxBlock = document.getElementById("buyBoxBlock");
const trendsBlock = document.getElementById("trendsBlock");
const calcResult = document.getElementById("calcResult");
const calcStatus = document.getElementById("calcStatus");
const competitiveSimulation = document.getElementById("competitiveSimulation");
const saveSimulation = document.getElementById("saveSimulation");

let currentItem = null;
let lastCalculationInput = null;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const settings = await chrome.storage.sync.get([
    "radarApiBase",
    "radarApiKey",
    "radarTaxPercent",
    "radarOperatingCost",
    "radarTargetMarginPercent",
    "radarTargetRoiPercent",
  ]);

  apiBase.value = settings.radarApiBase || "https://radar.optarys.com.br";
  apiKey.value = settings.radarApiKey || "";

  document.getElementById("taxPercent").value = String(
    settings.radarTaxPercent ?? 0,
  );
  document.getElementById("operatingCost").value = String(
    settings.radarOperatingCost ?? 0,
  );
  document.getElementById("targetMargin").value = String(
    settings.radarTargetMarginPercent ?? 20,
  );
  document.getElementById("targetRoi").value = String(
    settings.radarTargetRoiPercent ?? 30,
  );
}

async function renderContext(context) {
  currentItem = null;
  analyticsCard.hidden = true;
  watchCard.hidden = true;
  watchStatus.textContent = "";
  myOperationCard.hidden = true;
  myOperationBlock.innerHTML = "";
  marketCard.hidden = true;
  calculatorCard.hidden = true;
  calcResult.hidden = true;
  competitiveSimulation.hidden = true;
  saveSimulation.hidden = true;
  lastCalculationInput = null;
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

  const savedProfitSettings = await chrome.storage.sync.get([
    "radarTaxPercent",
    "radarOperatingCost",
    "radarTargetMarginPercent",
    "radarTargetRoiPercent",
  ]);

  const myOperationResponse = await request(
    "/api/extension/search-profitability",
    {
      method: "POST",
      body: {
        query: currentItem.title,
        items: [{ id: currentItem.id, price: currentItem.price }],
        taxPercent: Number(savedProfitSettings.radarTaxPercent || 0),
        operatingCost: Number(savedProfitSettings.radarOperatingCost || 0),
        targetMarginPercent: Number(
          savedProfitSettings.radarTargetMarginPercent || 20,
        ),
        targetRoiPercent: Number(savedProfitSettings.radarTargetRoiPercent || 30),
      },
    },
  );

  if (myOperationResponse?.ok && myOperationResponse.body?.matchedProduct) {
    const mine = myOperationResponse.body.matchedProduct;
    const economics = myOperationResponse.body.items?.[0] || null;

    if (mine.hasCost !== false && mine.unitCost != null) {
      document.getElementById("supplierPrice").value = String(mine.unitCost);
      document.getElementById("discountPercent").value = "0";

      myOperationBlock.innerHTML =
        '<div class="product-title">' + escapeHtml(mine.title) + '</div>' +
        '<p class="muted">Produto seu compatível · confiança ' +
          (mine.similarityPercent ?? 0) + '% · custo conhecido ' +
          brl(mine.unitCost) + '</p>' +
        (economics
          ? '<div class="grid">' +
              '<div class="metric"><small>Lucro nesse preço</small><strong>' +
                brl(economics.profit) + '</strong></div>' +
              '<div class="metric"><small>Minha margem</small><strong>' +
                pct(economics.marginPercent) + '</strong></div>' +
              '<div class="metric"><small>Meu ROI</small><strong>' +
                pct(economics.roiPercent) + '</strong></div>' +
              '<div class="metric"><small>Piso saudável</small><strong>' +
                brl(economics.minimumSuggestedPrice) + '</strong></div>' +
            '</div>'
          : '');

      myOperationCard.hidden = false;
    } else if (mine.hasCost === false) {
      myOperationBlock.innerHTML =
        '<div class="product-title">' + escapeHtml(mine.title) + '</div>' +
        '<p class="muted">Encontrei seu produto, mas o custo ainda não está cadastrado no Radar.</p>';
      myOperationCard.hidden = false;
    }
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
          competitors.slice(0, 5).map((item) =>
            '<div class="competitor-row competitor-row--rich">' +
              '<div><span>' + escapeHtml(item.title) + '</span>' +
              '<small>' +
                (item.demandLabel || "—") +
                (item.salesPerMonth == null ? "" : " · ~" + Math.round(item.salesPerMonth) + "/mês") +
                (item.ageDays == null ? "" : " · " + item.ageDays + " dias") +
              '</small></div>' +
              '<div><strong>' + brl(item.price) + '</strong>' +
              '<small>Radar ' + (item.score ?? 0) + '/100</small></div>' +
            '</div>'
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
  const kitQuantity = Math.max(
    1,
    Math.floor(Number(document.getElementById("kitQuantity").value || 1)),
  );
  if (supplierPrice < 0) return;

  const taxPercent = Number(document.getElementById("taxPercent").value || 0);
  const operatingCost = Number(
    document.getElementById("operatingCost").value || 0,
  );
  const targetMarginPercent = Number(
    document.getElementById("targetMargin").value || 20,
  );
  const targetRoiPercent = Number(
    document.getElementById("targetRoi").value || 30,
  );

  await chrome.storage.sync.set({
    radarTaxPercent: taxPercent,
    radarOperatingCost: operatingCost,
    radarTargetMarginPercent: targetMarginPercent,
    radarTargetRoiPercent: targetRoiPercent,
  });

  calcStatus.textContent = "Calculando comissão, frete e rentabilidade...";
  calcResult.hidden = true;

  const referencePrice =
    currentBuyBoxPrice ||
    (currentMarket?.p25 && currentMarket.p25 > 0 ? currentMarket.p25 : null);

  lastCalculationInput = {
    itemId: currentItem.id,
    marketReferencePrice: referencePrice || undefined,
    supplierPrice,
    discountPercent: Number(
      document.getElementById("discountPercent").value || 0,
    ),
    taxPercent,
    operatingCost,
    targetMarginPercent,
    targetRoiPercent,
    kitQuantity,
  };

  const response = await request("/api/extension/profitability", {
    method: "POST",
    body: lastCalculationInput,
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

  const strategy = response.body.strategy || null;

  competitiveSimulation.hidden = true;

  if (strategy) {
    const actionLabel =
      strategy.action === "REDUCE"
        ? "REDUZIR COM LIMITE"
        : strategy.action === "RAISE"
          ? "SUBIR PREÇO"
          : strategy.action === "RAISE_OR_EXIT"
            ? "SUBIR OU SAIR"
            : "MANTER";

    competitiveSimulation.innerHTML =
      '<strong>Preço competitivo saudável: ' + brl(strategy.recommendedPrice) + '</strong>' +
      '<div class="muted" style="margin-top:4px">' +
        actionLabel +
        ' · piso saudável ' + brl(strategy.safeFloor) +
        ' · referência ' + brl(strategy.marketReferencePrice) +
      '</div>' +
      '<div style="margin-top:6px;font-weight:700">' + escapeHtml(strategy.message) + '</div>' +
      '<div class="muted" style="margin-top:5px">' + escapeHtml(strategy.caveat) + '</div>';

    competitiveSimulation.hidden = false;
  }

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
        kitQuantity,
      },
    });

    if (competitiveResponse?.ok && competitiveResponse.body?.result) {
      const competitive = competitiveResponse.body.result;
      const source = currentBuyBoxPrice ? "Buy Box" : "P25 do mercado";

      competitiveSimulation.innerHTML +=
        '<div class="divider"></div>' +
        '<strong>Economia na referência: ' + brl(referencePrice) + '</strong>' +
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

  saveSimulation.hidden = false;
  saveSimulation.textContent = "Salvar simulação no Radar";
  calcResult.hidden = false;
});

saveSimulation.addEventListener("click", async () => {
  if (!lastCalculationInput) return;

  saveSimulation.disabled = true;
  saveSimulation.textContent = "Salvando...";

  const response = await request("/api/extension/profitability", {
    method: "POST",
    body: {
      ...lastCalculationInput,
      save: true,
    },
  });

  saveSimulation.disabled = false;

  if (!response?.ok || !response.body?.savedAnalysisId) {
    saveSimulation.textContent = "Falha ao salvar — tentar novamente";
    return;
  }

  saveSimulation.textContent = "Simulação salva";
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
