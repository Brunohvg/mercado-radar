/* One analysis surface. Page data stays useful when optional ML APIs are restricted. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const M = globalThis.RadarPanelModel;
  const A = globalThis.RadarProductAnalysis;
  const state = {
    context: null,
    item: null,
    auth: null,
    key: "",
    revision: 0,
    calcRevision: 0,
    calcBusy: false,
    candidates: [],
    selected: new Set(),
    result: null,
    comparisonTarget: null,
    focusedId: null,
    lastIntent: null,
    contextRequest: 0,
    server: "https://radar.optarys.com.br",
    edited: new Set(),
    automaticTimer: null,
    calculatorQuote: null,
    editCostInputs: false,
  };
  const brl = (n) =>
    n == null || !Number.isFinite(Number(n))
      ? "—"
      : (Object.is(Number(n), -0) ? 0 : Number(n)).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
  const pct = (n) =>
    n == null
      ? "—"
      : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  const count = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
  const stamp = (value) =>
    new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const current = () =>
    state.focusedId
      ? state.context?.items?.find((item) => item.id === state.focusedId) ||
        null
      : state.context?.page === "product"
        ? state.context.items?.[0]
        : null;
  const analysis = A.createController({
    send: (message) => chrome.runtime.sendMessage(message),
    preferences: () =>
      chrome.storage.sync.get([
        "radarTaxPercent",
        "radarOperatingCost",
        "radarTargetMarginPercent",
        "radarTargetRoiPercent",
      ]),
    changed: renderAutomatic,
  });
  function renderAutomatic(s) {
    const obs = current();
    $("autoAnalysis").hidden = !s.obs || s.obs.id !== obs?.id;
    if (!s.obs || s.obs.id !== obs?.id) return;
    const automaticIds = [
      "supplierPrice",
      "listingType",
      "logisticType",
      "packageWeight",
      "packageHeight",
      "packageWidth",
      "packageLength",
      "packageFreeShipping",
    ];
    const before = automaticIds
      .map((id) => ($(id).type === "checkbox" ? $(id).checked : $(id).value))
      .join("|");
    const d = A.demand(s.insight),
      o = A.decision(obs, s.insight, s.result),
      quote = s.quotes[s.listingType],
      payout = A.receipt(quote, obs.price);
    $("autoDemand").textContent = d.title;
    $("autoDemand").title = d.basis;
    $("autoVerdict").textContent = o.title;
    $("autoVerdict").className = "analysis-verdict " + o.tone;
    $("autoMetrics").replaceChildren(
      ...A.marketMetrics(s).map((fact) => {
        const box = metric(fact.label, fact.value);
        box.title = fact.detail;
        return box;
      }),
    );
    $("autoEvidence").textContent =
      d.basis +
      (s.analytics?.catalog?.visitsSample
        ? " Visitas: soma das ofertas medidas; cobertura pode ser parcial."
        : "");
    $("autoPayoutLabel").textContent = s.result
      ? "Lucro simulado por venda"
      : payout?.label || "Repasse após tarifas";
    $("autoPayout").textContent = brl(s.result?.profit ?? payout?.value);
    $("autoFees").textContent =
      quote?.fees?.commissionPercent == null
        ? "Tarifas ainda indisponíveis. Confira a conexão ou use tarifas verificadas na calculadora."
        : "Comissão " +
          pct(quote.fees.commissionPercent) +
          " · tarifa fixa " +
          brl(quote.fees.fixedFee);
    $("autoShipping").textContent = payout?.shippingApplied
      ? (payout.shippingEstimated
          ? "Frete estimado pela API: "
          : "Frete cotado na API: ") +
        brl(quote.fees.shippingCost) +
        ". O custo final depende do envio."
      : "Frete do vendedor a confirmar. O repasse acima ainda não desconta frete.";
    $("autoNote").textContent =
      s.status === "connection"
        ? "Entre na sua conta Radar para consultar tarifas e histórico."
        : (quote?.categorySource === "PREDICTED"
            ? "Categoria sugerida pelo título. "
            : "") +
          (s.result
            ? "Margem " +
              pct(s.result.marginPercent) +
              " · ROI " +
              pct(s.result.roiPercent)
            : "Repasse não é lucro: complete compra, imposto e operação.");
    for (const button of document.querySelectorAll("[data-auto-type]")) {
      const type = button.dataset.autoType,
        fee = s.quotes[type]?.fees?.commissionPercent;
      button.setAttribute("aria-pressed", String(type === s.listingType));
      button.textContent =
        (type === "CLASSIC" ? "Clássico" : "Premium") +
        (fee == null ? "" : " · " + pct(fee));
    }
    if (s.item) state.item = s.item;
    if (s.item?.shippingPackage) {
      for (const [id, key] of [
        ["packageWeight", "weightGrams"],
        ["packageHeight", "heightCm"],
        ["packageWidth", "widthCm"],
        ["packageLength", "lengthCm"],
      ])
        if (!state.edited.has(id))
          $(id).value = String(s.item.shippingPackage[key]);
      if (!state.edited.has("packageFreeShipping"))
        $("packageFreeShipping").checked = Boolean(s.item.freeShipping);
      if (!$("packageStatus").textContent)
        $("packageStatus").textContent =
          "Medidas de envio recebidas da API do anúncio. Confira para a sua embalagem.";
    }
    if (s.candidates.length && !state.candidates.length) {
      state.comparisonTarget = obs;
      setCandidates(s.candidates);
    }
    for (const [id, value] of [
      ["supplierPrice", s.fields.cost],
      ["listingType", s.listingType],
      [
        "logisticType",
        s.item?.logisticType || (obs.fulfillment ? "fulfillment" : "drop_off"),
      ],
    ])
      if (!state.edited.has(id) && value !== "") $(id).value = value;
    syncChoices();
    if (
      before !==
      automaticIds
        .map((id) => ($(id).type === "checkbox" ? $(id).checked : $(id).value))
        .join("|")
    ) {
      state.calcRevision++;
      state.result = null;
      $("calcResult").hidden = true;
    }
    if (
      quote &&
      !$("manualFees").checked &&
      M.money($("salePrice").value) === obs.price &&
      $("listingType").value === s.listingType &&
      ![
        "salePrice",
        "listingType",
        "logisticType",
        "packageWeight",
        "packageHeight",
        "packageWidth",
        "packageLength",
      ].some((id) => state.edited.has(id))
    )
      state.calculatorQuote = quote;
    renderCalculatorFields();
    if (
      !$("calculator").hidden &&
      !state.result &&
      !state.calcBusy &&
      M.money($("supplierPrice").value) != null &&
      M.money($("taxPercent").value) != null
    )
      scheduleCalculation();
  }
  function renderCalculatorFields() {
    const q = state.calculatorQuote,
      price = M.money($("salePrice").value),
      manualShipping = M.money($("shippingCost").value),
      tax = M.money($("taxPercent").value),
      quotedShipping =
        (q?.shippingKnown || q?.shippingEstimated) &&
        typeof q?.fees?.shippingCost === "number" &&
        Number.isFinite(q.fees.shippingCost)
          ? q.fees.shippingCost
          : null;
    $("salePriceReadout").textContent = brl(price);
    for (const [id, known] of [
      ["shippingField", manualShipping != null || quotedShipping != null],
      ["taxField", tax != null && tax <= 50],
    ]) {
      const group = $(id);
      if (!group.contains(document.activeElement))
        group.hidden = !state.editCostInputs && known;
    }
    $("calcAutoFacts").textContent = [
      ($("listingType").value === "PREMIUM" ? "Premium" : "Clássico") +
        (q?.fees?.commissionPercent == null
          ? " · tarifa a confirmar"
          : " · " +
            pct(q.fees.commissionPercent) +
            " + " +
            brl(q.fees.fixedFee)),
      manualShipping != null
        ? "Frete informado " + brl(manualShipping)
        : quotedShipping != null
          ? (q.shippingEstimated ? "Frete estimado " : "Frete cotado ") +
            brl(quotedShipping) +
            (q.shippingDiscount?.rate > 0
              ? " (" +
                pct(q.shippingDiscount.rate * 100) +
                " de desconto aplicado)"
              : "")
          : "Frete a confirmar",
      tax == null ? "Imposto a confirmar" : "Imposto " + pct(tax),
    ].join(" · ");
    $("editCostInputs").textContent = state.editCostInputs
      ? "Recolher custos confirmados"
      : "Alterar frete e imposto";
    renderCalculatorComparison();
  }
  function renderCalculatorComparison() {
    const prices = state.candidates
      .filter(
        (item) => state.selected.has(item.id) && item.id !== current()?.id,
      )
      .map((item) => Number(item.price));
    const sample = M.sample(prices, M.money($("salePrice").value));
    $("calcComparison").hidden = sample?.gap == null;
    $("calcComparison").textContent =
      sample?.gap == null
        ? ""
        : "Seu preço está " +
          pct(Math.abs(sample.gap)) +
          (sample.gap > 0
            ? " acima"
            : sample.gap < 0
              ? " abaixo"
              : " na faixa") +
          " da mediana de " +
          sample.count +
          " anúncios selecionados. Compare o mesmo kit e condição.";
  }
  function scheduleCalculation() {
    clearTimeout(state.automaticTimer);
    state.automaticTimer = setTimeout(() => {
      if (state.calcBusy) {
        scheduleCalculation();
        return;
      }
      if (
        M.money($("supplierPrice").value) == null ||
        M.money($("taxPercent").value) == null
      ) {
        if (!state.calculatorQuote && M.money($("salePrice").value) > 0)
          void calculate(true);
        return;
      }
      if ($("adsEnabled").checked && !(M.money($("adsRoas").value) > 0)) return;
      void calculate();
    }, 550);
  }
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }
  function notice(id, text, tone = "") {
    const el = $(id);
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "notice" + (tone ? " " + tone : "");
  }
  function metric(label, value, detail) {
    const el = node("div", null, "metric");
    el.append(node("small", label), node("strong", value));
    if (detail) el.append(node("span", detail, "muted"));
    return el;
  }
  function safeLink(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" &&
        /(^|\.)mercadolivre\.com\.br$/i.test(u.hostname)
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  async function request(path, method = "GET", body) {
    let timer;
    try {
      return await Promise.race([
        chrome.runtime.sendMessage({ type: "RADAR_FETCH", path, method, body }),
        new Promise((resolve) => {
          timer = setTimeout(
            () =>
              resolve({
                ok: false,
                status: 0,
                body: { error: "A consulta demorou. Tente novamente." },
              }),
            30000,
          );
        }),
      ]);
    } catch {
      return {
        ok: false,
        status: 0,
        body: {
          error:
            "Não foi possível falar com o Radar. Confira o servidor ou recarregue a extensão.",
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
  function errorText(response) {
    if (response?.status === 401)
      return "Sua sessão do Radar expirou. Entre novamente na conexão abaixo.";
    if (response?.status === 429)
      return (
        response.body?.error ||
        "Limite de consultas atingido. Aguarde antes de tentar novamente."
      );
    return response?.body?.error || "O Radar não respondeu. Tente novamente.";
  }
  function showTab(name) {
    $("contextCard").classList.toggle("compact", name !== "summary");
    for (const section of document.querySelectorAll(".tab-page"))
      section.hidden = section.id !== name;
    for (const button of document.querySelectorAll(".tabs button")) {
      if (button.dataset.tab === name)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (name === "calculator") {
      renderCalculatorFields();
      if (!state.result) scheduleCalculation();
    }
  }
  for (const button of document.querySelectorAll(".tabs button"))
    button.addEventListener("click", () => showTab(button.dataset.tab));
  for (const button of document.querySelectorAll("[data-tool]"))
    button.addEventListener("click", () => {
      $("toolMenu").open = false;
      if (button.dataset.tool === "connection") {
        $("connectionCard").open = true;
        $("connectionCard").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        showTab(button.dataset.tool);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  function evidenceLine(title, description, pending = false) {
    const el = node("div", null, "evidence-line");
    el.append(node("span", null, "evidence-dot" + (pending ? " pending" : "")));
    const text = node("div");
    text.append(node("b", title), node("div", description));
    el.append(text);
    return el;
  }
  function renderPage() {
    const obs = current(),
      search = state.context?.page === "search" && !obs;
    $("backToSearch").hidden = !(obs && state.context?.page === "search");
    $("productTitle").textContent =
      obs?.title ||
      (search
        ? "Anúncios desta busca"
        : "Abra um anúncio ou uma busca do Mercado Livre");
    const kind =
      obs?.referenceKind === "USER_PRODUCT"
        ? "Produto do vendedor"
        : obs?.referenceKind === "CATALOG"
          ? "Produto de catálogo"
          : "Anúncio";
    $("reference").textContent = obs
      ? kind + " · " + obs.id
      : search
        ? state.context.query || "Resultados visíveis"
        : "O painel acompanha a aba ativa.";
    $("readAt").textContent = state.context?.updatedAt
      ? "Lido nesta aba em " + stamp(state.context.updatedAt)
      : "";
    $("pageFacts").replaceChildren();
    if (obs) {
      $("pageFacts").append(
        metric("Preço na página", brl(obs.price), "Preço exibido agora"),
        metric(
          "Vendidos na página",
          obs.soldLabel ||
            (obs.soldLower == null
              ? "Não informado"
              : (obs.soldHasPlus ? "+" : "") + count(obs.soldLower)),
          "Acumulado; sem período informado",
        ),
      );
      if (obs.rating != null)
        $("pageFacts").append(
          metric(
            "Nota do produto",
            count(obs.rating) + " / 5",
            "Pode reunir avaliações de várias ofertas",
          ),
        );
      if (obs.reviews != null)
        $("pageFacts").append(
          metric(
            "Avaliações",
            count(obs.reviews),
            "Não equivale a vendas deste vendedor",
          ),
        );
    } else if (search)
      $("pageFacts").append(
        metric(
          "Anúncios reconhecidos",
          String(state.context.items.length),
          "Somente os cards carregados nesta página",
        ),
      );
    $("pageNote").textContent = obs
      ? "Leitura pública deste anúncio. Simule a margem com os custos da sua operação."
      : search
        ? "Selecione anúncios equivalentes em Preços. Você pode simular um produto sem sair da busca."
        : "O Radar não lê outras abas nem navega por anúncios automaticamente.";
    $("watchCard").hidden = !obs;
    $("autoAnalysis").hidden = !obs;
    $("searchActions").hidden = !search;
    $("calcEmpty").hidden = Boolean(obs);
    $("calculatorForm").hidden = !obs;
    $("retryApi").hidden = !obs;
    $("evidence").replaceChildren(
      evidenceLine(
        "Página aberta por você",
        "Preço, texto de vendidos e avaliações, quando exibidos.",
      ),
      evidenceLine(
        "Dados disponibilizados pela API",
        "Pedidos e estoque privados pertencem à conta autorizada. Visitas e ofertas dependem do recurso, da referência e da permissão liberada pela API.",
        true,
      ),
    );
    $("apiFacts").replaceChildren();
    $("apiStatus").textContent = "";
  }
  async function authStatus() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "RADAR_AUTH_STATUS",
      });
      state.auth = result;
      $("authTitle").textContent = result?.authenticated
        ? result.account?.nickname || "Conectado"
        : "Radar desconectado";
      $("authDot").classList.toggle("online", Boolean(result?.authenticated));
      $("connectionCard").open = !result?.authenticated;
      $("loginButton").textContent = result?.authenticated
        ? "Reconectar conta"
        : "Entrar no Mercado Radar";
      $("logoutButton").hidden = !result?.authenticated;
      $("authSubtitle").textContent = result?.authenticated
        ? "Conta individual · " +
          (result.access?.plan || "piloto") +
          ". Cada cliente mantém seus dados separados."
        : "Entre na sua conta Radar e autorize o seu vendedor do Mercado Livre.";
      $("authStatus").textContent = result?.error || "";
      if (result?.authenticated && result.extensionProtocol !== 2)
        notice(
          "globalStatus",
          "A extensão foi atualizada, mas o servidor ainda usa o protocolo anterior. Implante a mesma branch no Radar para usar os fluxos novos.",
          "warn",
        );
      return result;
    } catch {
      $("authStatus").textContent =
        "Recarregue a extensão para verificar a conexão.";
      return null;
    }
  }
  function usable() {
    if (!state.auth?.authenticated) {
      notice(
        "globalStatus",
        "Entre no Mercado Radar na conexão abaixo para usar esta função.",
        "warn",
      );
      return false;
    }
    if (state.auth.extensionProtocol !== 2) {
      notice(
        "globalStatus",
        "Atualize o backend e a extensão para a mesma versão antes de continuar.",
        "warn",
      );
      return false;
    }
    return true;
  }
  async function preferences() {
    const p = await chrome.storage.sync.get([
      "radarTaxPercent",
      "radarOperatingCost",
      "radarTargetMarginPercent",
      "radarTargetRoiPercent",
      "radarApiBase",
    ]);
    $("taxPercent").value =
      p.radarTaxPercent == null ? "" : String(p.radarTaxPercent);
    $("operatingCost").value = String(p.radarOperatingCost ?? 0);
    $("targetMargin").value = String(p.radarTargetMarginPercent ?? 20);
    $("targetRoi").value = String(p.radarTargetRoiPercent ?? 30);
    state.server = p.radarApiBase || "https://radar.optarys.com.br";
    $("apiBase").value = state.server;
    $("dashboardLink").href = state.server;
    $("monitorLink").href = state.server + "/monitoramento";
    $("menuMonitorLink").href = state.server + "/monitoramento";
  }
  function resetAnalysis() {
    $("saveDialog").close();
    state.pendingSnapshot = null;
    analysis.clear();
    clearTimeout(state.automaticTimer);
    state.edited.clear();
    state.item = null;
    state.revision++;
    state.calcRevision++;
    state.result = null;
    state.calculatorQuote = null;
    state.editCostInputs = false;
    $("priceField").hidden = true;
    state.calcBusy = false;
    for (const id of [
      "calculate",
      "quoteButton",
      "marketButton",
      "retryApi",
      "watchButton",
    ])
      $(id).disabled = false;
    state.candidates = [];
    state.selected.clear();
    $("calcResult").hidden = true;
    $("candidates").replaceChildren();
    $("marketRange").replaceChildren();
    $("sampleNote").textContent = "";
    $("candidateFilter").value = "";
    $("candidateSort").value = "position";
    $("candidateTools").hidden = true;
    $("selectAll").hidden = true;
    $("clearSelection").hidden = true;
    $("watchButton").textContent = "Monitorar por novas leituras";
    $("watchStatus").textContent = "";
    notice("calcStatus", "");
    notice("marketStatus", "");
    $("quoteStatus").textContent = "";
    renderPage();
    const obs = current();
    $("salePrice").value =
      obs?.price == null
        ? ""
        : Number(obs.price).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
    $("supplierPrice").value = "";
    $("shippingCost").value = "";
    $("kitQuantity").value = "1";
    $("discountPercent").value = "0";
    $("packageFreeShipping").checked = Boolean(obs?.freeShipping);
    for (const id of [
      "calcOptions",
      "costDetails",
      "packageDetails",
      "adsDetails",
      "advancedDetails",
    ])
      $(id).open = false;
    for (const id of [
      "packageWeight",
      "packageHeight",
      "packageWidth",
      "packageLength",
    ])
      $(id).value = "";
    $("packageStatus").textContent = "";
    $("adsEnabled").checked = false;
    $("adsFields").hidden = true;
    $("adsRoas").value = "";
    $("adsShare").value = "100";
    $("listingType").value = "CLASSIC";
    $("logisticType").value = obs?.fulfillment ? "fulfillment" : "drop_off";
    syncChoices();
    $("manualFees").checked = false;
    $("manualFeeFields").hidden = true;
    for (const input of $("calculatorForm").querySelectorAll("[aria-invalid]"))
      input.removeAttribute("aria-invalid");
    if (obs) void analysis.load(obs);
  }
  function focusProduct(id) {
    state.focusedId = id;
    resetAnalysis();
    state.comparisonTarget = current();
  }
  function applyIntent(intent) {
    if (
      !intent ||
      intent.id === state.lastIntent ||
      intent.tabId !== state.context?.tabId ||
      Date.now() - intent.issuedAt > 120000 ||
      intent.issuedAt > Date.now() + 5000
    )
      return;
    if (
      intent.referenceId &&
      !state.context.items.some((i) => i.id === intent.referenceId)
    )
      return;
    state.lastIntent = intent.id;
    if (intent.referenceId) focusProduct(intent.referenceId);
    else if (state.focusedId && state.context.page === "search")
      focusProduct(null);
    if (intent.tab === "connection") {
      $("connectionCard").open = true;
      $("connectionCard").scrollIntoView({ block: "start" });
      return;
    }
    if (intent.tab === "market" && state.context.page === "search") {
      setCandidates(
        state.context.items.map((item) => ({
          ...item,
          source: "VISIBLE_SEARCH",
          capturedAt: state.context.updatedAt,
        })),
      );
      for (const id of intent.selectedIds || [])
        if (state.candidates.some((i) => i.id === id)) state.selected.add(id);
      renderCandidates();
      renderSample();
    }
    showTab(
      ["summary", "calculator", "market"].includes(intent.tab)
        ? intent.tab
        : "summary",
    );
    window.scrollTo({ top: 0 });
  }
  $("backToSearch").addEventListener("click", () => {
    focusProduct(null);
    setCandidates(
      state.context.items.map((item) => ({
        ...item,
        source: "VISIBLE_SEARCH",
        capturedAt: state.context.updatedAt,
      })),
    );
    showTab("market");
  });
  async function loadContext(force = false) {
    const requestId = ++state.contextRequest;
    const context = await chrome.runtime
      .sendMessage({ type: "RADAR_CONTEXT_GET" })
      .catch(() => null);
    if (requestId !== state.contextRequest) return;
    const key = JSON.stringify(
      context ? { ...context, updatedAt: null } : null,
    );
    if (!force && key === state.key) return;
    state.key = key;
    const keepFocus =
      state.context?.tabId === context?.tabId &&
      state.context?.url === context?.url &&
      context?.items?.some((i) => i.id === state.focusedId);
    if (!keepFocus) state.focusedId = null;
    state.context = context;
    resetAnalysis();
    if (context?.page === "search" && !current()) {
      const stored = await chrome.storage.session.get([
        "radarComparisonTarget",
      ]);
      if (requestId !== state.contextRequest) return;
      state.comparisonTarget = stored.radarComparisonTarget || null;
      setCandidates(
        context.items.map((item) => ({
          ...item,
          source: "VISIBLE_SEARCH",
          capturedAt: context.updatedAt,
        })),
      );
      showTab("market");
    } else {
      state.comparisonTarget = current();
    }
    const intents = await chrome.storage.session.get(["radarPanelIntent"]);
    if (requestId !== state.contextRequest) return;
    applyIntent(intents.radarPanelIntent);
    const revision = state.revision,
      obs = current();
    if (context?.items?.length && !obs && usableQuietly()) {
      const response = await request("/api/extension/observations", "POST", {
        page: context.page,
        query: context.query,
        items: context.items,
      });
      if (revision !== state.revision) return;
      if (!response?.ok)
        notice(
          "globalStatus",
          "A leitura local está disponível. Não foi possível salvar histórico: " +
            errorText(response),
          "warn",
        );
      else {
        notice("globalStatus", "");
        const insight = response.body.items?.find(
          (item) => item.id === obs?.id,
        );
        if (obs && insight?.isOwn && insight.estimate?.method === "OFICIAL") {
          const e = insight.estimate;
          $("evidence").append(
            evidenceLine(
              "Pedidos da sua conta",
              count(Math.round(e.salesPerDay.value * e.windowDays)) +
                " unidades em " +
                e.windowDays +
                " dias. Receita exige conciliação de preços e estornos no painel.",
            ),
          );
        }
      }
    }
  }
  function usableQuietly() {
    return state.auth?.authenticated && state.auth.extensionProtocol === 2;
  }
  async function loadDetails() {
    const obs = current();
    if (!obs || !usable()) return;
    const revision = state.revision;
    $("retryApi").disabled = true;
    $("apiStatus").textContent = "Consultando detalhes disponíveis…";
    try {
      const params = new URLSearchParams({
        id: obs.id,
        kind:
          obs.referenceKind ||
          (obs.id.startsWith("MLBU") ? "USER_PRODUCT" : "ITEM"),
      });
      const response = await request("/api/extension/item?" + params);
      if (revision !== state.revision) return;
      if (!response?.ok) {
        $("apiStatus").textContent = errorText(response);
        return;
      }
      state.item = response.body.item || null;
      $("apiStatus").textContent =
        response.body.note ||
        "Dados disponíveis pela API para esta oferta. A calculadora simula as modalidades que você escolher.";
      $("apiFacts").replaceChildren();
      for (const [label, value] of [
        ["Anúncio confirmado", state.item?.id],
        ["Categoria", state.item?.categoryId],
        [
          "Modalidade no ML",
          state.item?.listingTypeId === "gold_pro"
            ? "Premium"
            : state.item?.listingTypeId === "gold_special"
              ? "Clássico"
              : null,
        ],
        [
          "Pertence à sua conta",
          state.item ? (state.item.isOwn ? "Sim" : "Não") : null,
        ],
      ]) {
        if (value == null) continue;
        const row = node("div");
        row.append(node("span", label), node("b", value));
        $("apiFacts").append(row);
      }
    } finally {
      if (revision === state.revision) $("retryApi").disabled = false;
    }
  }
  function inputNumber(id, min, max, required = true) {
    const el = $(id),
      value = M.money(el.value);
    const valid = value != null && value >= min && value <= max;
    el.setAttribute(
      "aria-invalid",
      String(!valid && (required || el.value !== "")),
    );
    if (!valid && required)
      throw new Error(
        "Confira o campo “" +
          document.querySelector('label[for="' + id + '"]').textContent +
          "”.",
      );
    return valid ? value : undefined;
  }
  function calcPayload(quoteOnly = false) {
    const obs = current();
    if (!obs) throw new Error("Abra um anúncio para simular.");
    const quantity = inputNumber("kitQuantity", 1, 1000);
    if (!Number.isInteger(quantity))
      throw new Error("A quantidade do kit precisa ser inteira.");
    const data = {
      itemId: state.item?.id || obs.id,
      title: obs.title,
      categoryId: state.item?.categoryId || obs.categoryId || undefined,
      salePrice: inputNumber("salePrice", 0.01, 10000000),
      supplierPrice: quoteOnly ? 0 : inputNumber("supplierPrice", 0, 10000000),
      kitQuantity: quantity,
      discountPercent: inputNumber("discountPercent", 0, 95),
      taxPercent: inputNumber("taxPercent", 0, 50, !quoteOnly),
      operatingCost: inputNumber("operatingCost", 0, 10000000),
      targetMarginPercent: inputNumber("targetMargin", 0, 80),
      targetRoiPercent: inputNumber("targetRoi", 0, 500),
      shippingCost: inputNumber("shippingCost", 0, 10000, false),
      listingType: $("listingType").value,
      logisticType: $("logisticType").value,
      freeShipping: obs.freeShipping,
      quoteOnly,
    };
    if ($("manualFees").checked)
      data.manualFees = {
        commissionPercent: inputNumber("commissionPercent", 0, 50),
        fixedFee: inputNumber("fixedFee", 0, 10000),
      };
    const packageFields = [
      "packageWeight",
      "packageHeight",
      "packageWidth",
      "packageLength",
    ];
    if (
      data.shippingCost == null &&
      packageFields.some((id) => $(id).value !== "") &&
      [...packageFields, "packageFreeShipping"].some((id) =>
        state.edited.has(id),
      )
    ) {
      const weight = inputNumber("packageWeight", 1, 100000);
      if (!Number.isInteger(weight))
        throw new Error("Informe o peso em gramas inteiras.");
      data.shippingPackage = {
        weightGrams: weight,
        heightCm: inputNumber("packageHeight", 1, 300),
        widthCm: inputNumber("packageWidth", 1, 300),
        lengthCm: inputNumber("packageLength", 1, 300),
        freeShipping: $("packageFreeShipping").checked,
      };
    }
    if (!quoteOnly && $("adsEnabled").checked) {
      const roas = inputNumber("adsRoas", 0.01, 1000);
      data.advertising = {
        roasTarget: roas,
        attributedSalesPercent: inputNumber("adsShare", 0, 100),
      };
    }
    return data;
  }
  function quoteText(body) {
    const fee = body.fees;
    const text =
      fee?.commissionPercent == null
        ? "Tarifa indisponível pela API. Você pode informar comissão e tarifa fixa conferidas no simulador oficial em “Metas e tarifas manuais”."
        : "Comissão " +
          pct(fee.commissionPercent) +
          " + tarifa fixa " +
          brl(fee.fixedFee) +
          (body.feeSource === "MANUAL"
            ? " · valores manuais."
            : " · cotação da API para esta simulação.");
    return (
      text +
      (body.categorySource === "PREDICTED"
        ? " Categoria sugerida pelo título; confira antes de decidir."
        : "") +
      (body.fees?.shippingCost == null
        ? " Falta informar o seu frete; zero também precisa ser confirmado."
        : " Frete " +
          (body.shippingEstimated
            ? "estimado pela API: "
            : body.shippingKnown
              ? "cotado pela API: "
              : "informado: ") +
          brl(body.fees.shippingCost) +
          ".") +
      (body.shippingNote ? " " + body.shippingNote : "")
    );
  }
  async function calculate(quoteOnly = false) {
    if (state.calcBusy || !usable()) return;
    clearTimeout(state.automaticTimer);
    let payload;
    try {
      payload = calcPayload(quoteOnly);
    } catch (error) {
      notice("calcStatus", error.message, "error");
      return;
    }
    const revision = state.revision,
      calcRevision = state.calcRevision;
    state.calcBusy = true;
    $("calculate").disabled = true;
    $("quoteButton").disabled = true;
    $("saveSimulation").disabled = true;
    notice(
      "calcStatus",
      quoteOnly
        ? "Consultando tarifa…"
        : "Calculando com os parâmetros informados…",
    );
    state.result = null;
    $("calcResult").hidden = true;
    try {
      const response = await request(
        "/api/extension/profitability",
        "POST",
        payload,
      );
      if (revision !== state.revision || calcRevision !== state.calcRevision)
        return;
      if (!response?.ok) {
        notice("calcStatus", errorText(response), "error");
        return;
      }
      const body = response.body;
      state.calculatorQuote = body;
      renderCalculatorFields();
      $("quoteStatus").textContent = quoteText(body);
      $("packageStatus").textContent = body.shippingEstimated
        ? "Frete estimado: " +
          brl(body.fees.shippingCost) +
          ". " +
          body.shippingNote
        : body.shippingNote || "";
      if (!body.result) {
        if (
          quoteOnly &&
          !(body.needs || []).some((n) => n !== "taxPercent") &&
          M.money($("supplierPrice").value) != null &&
          M.money($("taxPercent").value) != null
        )
          state.automaticTimer = setTimeout(() => void calculate(), 0);
        notice(
          "calcStatus",
          quoteOnly
            ? "Consulta concluída. Complete os custos para simular lucro."
            : "Ainda faltam custos: " +
                (body.needs || [])
                  .map(
                    (n) =>
                      ({
                        fees: "comissão e tarifa fixa",
                        taxPercent: "imposto",
                        shippingCost: "seu frete por venda",
                      })[n] || n,
                  )
                  .join(", ") +
                ".",
          "warn",
        );
        return;
      }
      state.result = body;
      const r = body.result;
      $("calcResult").hidden = false;
      const ads = body.adsSimulation;
      const conclusion = A.decision(current(), analysis.state.insight, r, ads);
      $("calcDecision").textContent = conclusion.title;
      $("calcDecision").className = "calc-decision " + conclusion.tone;
      $("calcDecisionReason").textContent = conclusion.reason;
      $("profit").textContent = brl(ads?.profitAfterAds ?? r.profit);
      $("margin").textContent = pct(
        ads?.marginAfterAdsPercent ?? r.marginPercent,
      );
      $("margin").previousElementSibling.textContent = ads
        ? "Margem após Ads"
        : "Margem";
      $("roi").previousElementSibling.textContent = ads
        ? "Retorno sobre o custo · antes de Ads"
        : "Retorno sobre o custo · ROI";
      $("roi").textContent =
        r.purchaseCost + payload.operatingCost > 0
          ? pct(r.roiPercent)
          : "Sem capital";
      $("profit").parentElement.classList.toggle(
        "loss",
        (ads?.profitAfterAds ?? r.profit) < 0,
      );
      $("adsResult").hidden = !ads;
      $("adsResult").replaceChildren();
      if (ads)
        $("adsResult").append(
          metric("Lucro antes de Ads", brl(r.profit)),
          metric("Ads médios por venda", brl(ads.costPerSale)),
          metric("TACOS simulado", pct(ads.tacosPercent)),
          metric(
            "ROAS mínimo por venda de Ads",
            ads.breakEvenRoas == null
              ? "Inviável neste preço"
              : count(ads.breakEvenRoas) + "×",
          ),
        );
      $("resultSource").textContent = ads
        ? "Cenário após Ads · hipóteses suas"
        : body.shippingEstimated
          ? "Frete estimado"
          : body.feeSource === "MANUAL"
            ? "Tarifas manuais"
            : "Tarifas Mercado Livre";
      $("priceGoalLabel").textContent = ads
        ? "Meta antes de Ads"
        : "Preço para sua meta";
      $("priceFloorValue").textContent =
        r.minimumSuggestedPrice == null
          ? "Meta inviável"
          : brl(r.minimumSuggestedPrice);
      $("breakdown").replaceChildren();
      const rows = [
        ["Preço de venda", r.salePrice],
        ["Comissão · " + pct(r.commissionPercent), -r.commissionAmount],
        ["Tarifa fixa", -r.fixedFee],
        [
          body.shippingEstimated
            ? "Frete estimado pela API"
            : body.shippingKnown
              ? "Frete cotado"
              : "Frete informado",
          -r.shippingCost,
        ],
        ["Imposto · " + pct(r.taxPercent), -r.taxAmount],
        ["Compra · " + payload.kitQuantity + " un.", -r.purchaseCost],
        ["Embalagem e operação", -r.operatingCost],
        ["Lucro simulado", r.profit],
        ...(ads
          ? [
              ["Ads médios por venda", -ads.costPerSale],
              ["Lucro após Ads", ads.profitAfterAds],
            ]
          : []),
      ];
      for (const [label, value] of rows) {
        const row = node("div");
        row.append(node("dt", label), node("dd", brl(value)));
        $("breakdown").append(row);
      }
      $("priceFloor").textContent =
        (ads ? "Piso teórico antes de Ads: " : "Piso teórico para as metas: ") +
        (r.minimumSuggestedPrice == null
          ? "meta inviável com estas taxas"
          : brl(r.minimumSuggestedPrice)) +
        ". Taxas e frete podem mudar ao alterar o preço; consulte novamente.";
      $("calcCaveat").textContent =
        (body.note || "") +
        (ads
          ? " Inclui o cenário médio de Ads informado."
          : " Não inclui Ads.") +
        " Não inclui devoluções, tributos adicionais ou custos que você não informou.";
      $("saveSimulation").hidden = r.minimumSuggestedPrice == null;
      notice("calcStatus", "");
    } finally {
      if (revision === state.revision) {
        state.calcBusy = false;
        $("calculate").disabled = false;
        $("quoteButton").disabled = false;
        $("saveSimulation").disabled = false;
      }
    }
  }
  function setCandidates(items) {
    state.candidates = [
      ...new Map(
        items
          .filter((i) => Number(i.price) > 0 && i.id !== current()?.id)
          .map((i) => [i.id, i]),
      ).values(),
    ];
    state.selected.clear();
    renderCandidates();
    renderSample();
  }
  function visibleCandidates() {
    const query = $("candidateFilter").value.trim().toLocaleLowerCase("pt-BR");
    const items = state.candidates.filter(
      (i) => !query || i.title.toLocaleLowerCase("pt-BR").includes(query),
    );
    if ($("candidateSort").value === "price-asc")
      items.sort((a, b) => a.price - b.price);
    if ($("candidateSort").value === "price-desc")
      items.sort((a, b) => b.price - a.price);
    return items;
  }
  function renderCandidates() {
    $("candidates").replaceChildren();
    $("candidateTools").hidden = !state.candidates.length;
    const visible = visibleCandidates();
    $("selectAll").hidden = !visible.length;
    $("candidateCount").textContent =
      visible.length +
      " de " +
      state.candidates.length +
      " anúncios · " +
      state.selected.size +
      " selecionados";
    for (const item of visible) {
      const row = node("article", null, "candidate"),
        label = node("label", null, "check"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.id;
      input.checked = state.selected.has(item.id);
      label.append(input, node("span", item.title));
      input.addEventListener("change", () => {
        if (input.checked) state.selected.add(item.id);
        else state.selected.delete(item.id);
        renderSample();
      });
      row.append(label, node("div", brl(item.price), "candidate-price"));
      const info = node(
        "small",
        (item.source === "CATALOG_API" ? "Catálogo API" : "Página observada") +
          " · " +
          stamp(item.capturedAt || new Date()),
      );
      row.append(info);
      if (
        state.context?.page === "search" &&
        state.context.items.some((i) => i.id === item.id)
      ) {
        const analyze = node(
          "button",
          "Simular lucro",
          "candidate-action secondary",
        );
        analyze.type = "button";
        analyze.addEventListener("click", () => {
          focusProduct(item.id);
          showTab("calculator");
          window.scrollTo({ top: 0 });
        });
        row.append(analyze);
      }
      const href = safeLink(item.permalink);
      if (href) {
        const link = node("a", "Ver anúncio ↗");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener";
        info.append(document.createTextNode(" · "), link);
      }
      $("candidates").append(row);
    }
  }
  $("candidateFilter").addEventListener("input", renderCandidates);
  $("candidateSort").addEventListener("change", renderCandidates);
  $("clearSelection").addEventListener("click", () => {
    state.selected.clear();
    renderCandidates();
    renderSample();
  });
  function renderSample() {
    renderCalculatorComparison();
    $("clearSelection").hidden = !state.selected.size;
    $("candidateCount").textContent =
      visibleCandidates().length +
      " de " +
      state.candidates.length +
      " anúncios · " +
      state.selected.size +
      " selecionados";
    const prices = state.candidates
      .filter((i) => state.selected.has(i.id))
      .map((i) => Number(i.price));
    const target = current() || state.comparisonTarget;
    const summary = M.sample(prices, target?.price);
    $("marketRange").replaceChildren();
    $("sampleNote").textContent = summary
      ? summary.count +
        " anúncios selecionados por você. Frete do comprador, prazo e reputação não entram nessa faixa." +
        (target?.title ? " Referência: " + target.title + "." : "")
      : prices.length +
        " selecionados. Selecione pelo menos 3 anúncios equivalentes para calcular uma faixa.";
    if (!summary) return;
    $("marketRange").append(
      metric("Mediana da amostra", brl(summary.median)),
      metric(
        "Faixa central · P25–P75",
        brl(summary.p25) + " – " + brl(summary.p75),
      ),
    );
    if (summary.gap != null)
      $("marketRange").append(
        metric(
          "Referência vs. mediana",
          (summary.gap > 0 ? "+" : "") + pct(summary.gap),
          "Comparação de preço, sem previsão de vendas",
        ),
      );
  }
  async function loadMarket() {
    if (state.context?.page === "search") {
      setCandidates(
        state.context.items.map((i) => ({
          ...i,
          source: "VISIBLE_SEARCH",
          capturedAt: state.context.updatedAt,
        })),
      );
      notice(
        "marketStatus",
        "Selecione os produtos equivalentes que você conferiu nos cards.",
      );
      return;
    }
    const obs = current();
    if (!obs || !usable()) return;
    const revision = state.revision;
    $("marketButton").disabled = true;
    notice(
      "marketStatus",
      "Buscando candidatos na sua navegação e no catálogo disponível…",
    );
    try {
      const params = new URLSearchParams({ title: obs.title, itemId: obs.id });
      if (obs.price) params.set("currentPrice", String(obs.price));
      const response = await request("/api/extension/market?" + params);
      if (revision !== state.revision) return;
      if (!response?.ok) {
        notice("marketStatus", errorText(response), "error");
        return;
      }
      setCandidates(response.body.competitors || []);
      notice(
        "marketStatus",
        response.body.note,
        state.candidates.length ? "" : "warn",
      );
    } finally {
      if (revision === state.revision) $("marketButton").disabled = false;
    }
  }
  $("searchButton").addEventListener("click", async () => {
    const target = current() || state.comparisonTarget;
    const query = target?.title || state.context?.query;
    if (!query) {
      notice(
        "marketStatus",
        "Abra um anúncio ou uma busca antes de comparar.",
        "warn",
      );
      return;
    }
    if (target)
      await chrome.storage.session.set({ radarComparisonTarget: target });
    await chrome.tabs.create({
      url:
        "https://lista.mercadolivre.com.br/" +
        encodeURIComponent(query.replace(/\s+/g, "-")),
    });
  });
  $("selectAll").addEventListener("click", () => {
    for (const input of $("candidates").querySelectorAll("input")) {
      input.checked = true;
      state.selected.add(input.value);
    }
    renderSample();
  });
  $("watchButton").addEventListener("click", async () => {
    const obs = current();
    if (!obs || !usable()) return;
    const revision = state.revision;
    $("watchButton").disabled = true;
    $("watchStatus").textContent = "Salvando leitura…";
    const response = await request("/api/extension/watchlist", "POST", {
      itemId: obs.id,
      referenceId: obs.id,
      observation: obs,
    });
    if (revision !== state.revision) return;
    $("watchButton").disabled = Boolean(response?.ok);
    $("watchButton").textContent = response?.ok
      ? "Salvo no seu monitoramento"
      : "Tentar monitorar novamente";
    $("watchStatus").textContent = response?.ok
      ? response.body.note
      : errorText(response);
  });
  $("calculatorForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void calculate();
  });
  $("calculatorForm").addEventListener("input", () => {
    state.calcRevision++;
    state.result = null;
    $("calcResult").hidden = true;
    notice("calcStatus", "");
    if ($("quoteStatus").textContent)
      $("quoteStatus").textContent =
        "Parâmetros alterados. Consulte novamente para atualizar a tarifa.";
  });
  $("calculatorForm").addEventListener("input", (event) => {
    syncChoices();
    state.edited.add(event.target.id);
    if (
      [
        "salePrice",
        "listingType",
        "logisticType",
        "packageWeight",
        "packageHeight",
        "packageWidth",
        "packageLength",
        "manualFees",
        "commissionPercent",
        "fixedFee",
      ].includes(event.target.id)
    )
      state.calculatorQuote = null;
    renderCalculatorFields();
    scheduleCalculation();
  });
  for (const input of $("calculatorForm").querySelectorAll(
    "select, input[type=checkbox]",
  ))
    input.addEventListener("change", () =>
      input.dispatchEvent(new Event("input", { bubbles: true })),
    );
  for (const button of document.querySelectorAll("[data-input]"))
    button.addEventListener("click", () => {
      const input = $(button.dataset.input);
      input.value = button.dataset.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  function syncChoices() {
    for (const button of document.querySelectorAll(
      "[data-select], [data-input]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(
          $(button.dataset.select || button.dataset.input).value ===
            button.dataset.value,
        ),
      );
  }
  for (const button of document.querySelectorAll("[data-select]"))
    button.addEventListener("click", () => {
      const input = $(button.dataset.select);
      input.value = button.dataset.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  $("customTax").addEventListener("click", () => $("taxPercent").focus());
  $("adsEnabled").addEventListener("change", () => {
    $("adsFields").hidden = !$("adsEnabled").checked;
  });
  $("estimatePackage").addEventListener("click", () => {
    state.edited.add("packageWeight");
    if (M.money($("shippingCost").value) != null) {
      $("shippingCost").value = "";
      $("shippingCost").dispatchEvent(new Event("input", { bubbles: true }));
    }
    void calculate(true);
  });
  function openShipping() {
    showTab("calculator");
    $("calcOptions").open = true;
    $("packageDetails").open = true;
    $("packageDetails").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  $("estimateShipping").addEventListener("click", openShipping);
  $("openShipping").addEventListener("click", openShipping);
  for (const button of document.querySelectorAll("[data-auto-type]"))
    button.addEventListener("click", () =>
      analysis.selectType(button.dataset.autoType),
    );
  $("usePagePrice").addEventListener("click", () => {
    const price = current()?.price;
    if (!(price > 0)) return;
    $("salePrice").value = Number(price).toFixed(2).replace(".", ",");
    $("salePrice").dispatchEvent(new Event("input", { bubbles: true }));
    $("priceField").hidden = true;
  });
  $("editSalePrice").addEventListener("click", () => {
    $("priceField").hidden = !$("priceField").hidden;
    if (!$("priceField").hidden) $("salePrice").focus();
  });
  $("editCostInputs").addEventListener("click", () => {
    state.editCostInputs = !state.editCostInputs;
    renderCalculatorFields();
  });
  $("manualFees").addEventListener("change", () => {
    $("manualFeeFields").hidden = !$("manualFees").checked;
  });
  $("quoteButton").addEventListener("click", () => void calculate(true));
  $("saveSimulation").addEventListener("click", () => {
    if (!state.result) return;
    const body = state.result,
      result = body.result,
      ads = body.adsSimulation;
    try {
      state.pendingSnapshot = {
        ...calcPayload(),
        save: true,
        saveMode: "SNAPSHOT",
        expectedProfit: result.profit,
      };
    } catch {
      return;
    }
    $("saveProduct").textContent = current().title;
    $("saveFacts").replaceChildren(
      metric("Preço de venda", brl(result.salePrice)),
      metric("Custo de compra", brl(result.purchaseCost)),
      metric(
        ads ? "Lucro após Ads" : "Lucro simulado",
        brl(ads?.profitAfterAds ?? result.profit),
      ),
      metric(
        "Margem simulada",
        pct(ads?.marginAfterAdsPercent ?? result.marginPercent),
      ),
    );
    $("saveSource").textContent =
      quoteText(body) + (ads ? " Publicidade: hipóteses suas." : "");
    $("snapshotSupplier").value = "";
    $("confirmSnapshot").disabled = false;
    $("confirmSnapshot").hidden = false;
    $("historyLink").hidden = true;
    notice("saveStatus", "");
    $("saveDialog").showModal();
  });
  $("confirmSnapshot").addEventListener("click", async () => {
    const payload = state.pendingSnapshot;
    if (!payload || !usable()) return;
    const revision = state.revision;
    $("confirmSnapshot").disabled = true;
    notice("saveStatus", "Conferindo a cotação e salvando…");
    const response = await request("/api/extension/profitability", "POST", {
      ...payload,
      supplierName: $("snapshotSupplier").value.trim(),
    });
    if (revision !== state.revision) return;
    $("confirmSnapshot").disabled = false;
    if (!response?.ok || !response.body?.savedAnalysisId) {
      notice(
        "saveStatus",
        response?.body?.error || "Não foi possível salvar. Tente novamente.",
        "error",
      );
      return;
    }
    state.pendingSnapshot = null;
    $("confirmSnapshot").hidden = true;
    $("historyLink").href = state.server + "/historico";
    $("historyLink").hidden = false;
    notice("saveStatus", "Simulação salva no histórico da sua operação.");
  });
  $("copyResult").addEventListener("click", async () => {
    if (!state.result) return;
    const text = [
      current()?.title,
      $("resultSource").textContent,
      ...[...$("breakdown").children].map((row) => row.textContent),
      $("priceFloor").textContent,
      $("calcCaveat").textContent,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notice("calcStatus", "Memória de cálculo copiada.");
    } catch {
      notice(
        "calcStatus",
        "O Chrome não autorizou copiar. A memória continua visível.",
        "warn",
      );
    }
  });
  $("marketButton").addEventListener("click", () => void loadMarket());
  $("retryApi").addEventListener("click", () => void loadDetails());
  $("refresh").addEventListener("click", async () => {
    $("refresh").disabled = true;
    try {
      await authStatus();
      await preferences();
      await loadContext(true);
    } finally {
      $("refresh").disabled = false;
    }
  });
  $("loginButton").addEventListener("click", async () => {
    $("loginButton").disabled = true;
    $("authStatus").textContent = "Abrindo sua autorização…";
    try {
      const r = await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGIN" });
      if (!r?.authenticated) {
        $("authStatus").textContent = r?.error || "Login não concluído.";
        return;
      }
      await authStatus();
      await preferences();
      await loadContext(true);
    } catch {
      $("authStatus").textContent = "Não foi possível concluir a conexão.";
    } finally {
      $("loginButton").disabled = false;
    }
  });
  $("logoutButton").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGOUT" });
    state.result = null;
    state.calculatorQuote = null;
    renderCalculatorFields();
    $("calcResult").hidden = true;
    await authStatus();
    await preferences();
    await loadContext(true);
  });
  $("saveServer").addEventListener("click", async () => {
    try {
      const url = new URL($("apiBase").value);
      if (
        url.origin !== "https://radar.optarys.com.br" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        throw new Error();
      await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGOUT" });
      await chrome.storage.sync.set({ radarApiBase: url.origin });
      await authStatus();
      await preferences();
      notice("globalStatus", "Servidor salvo. Entre na conta deste ambiente.");
    } catch {
      notice(
        "globalStatus",
        "Use https://radar.optarys.com.br ou http://localhost:porta no desenvolvimento.",
        "error",
      );
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === "local" && changes.radarAccessToken) ||
      (area === "sync" &&
        [
          "radarPreferencesWorkspace",
          "radarTaxPercent",
          "radarOperatingCost",
          "radarTargetMarginPercent",
          "radarTargetRoiPercent",
        ].some((k) => changes[k]))
    ) {
      analysis.clear();
      state.revision++;
      state.contextRequest++;
      $("saveDialog").close();
      state.pendingSnapshot = null;
      state.auth = null;
      state.item = null;
      state.candidates = [];
      state.selected.clear();
      $("candidates").replaceChildren();
      $("marketRange").replaceChildren();
      for (const id of ["supplierPrice", "shippingCost", "taxPercent"])
        $(id).value = "";
      state.result = null;
      state.calculatorQuote = null;
      state.editCostInputs = false;
      renderCalculatorFields();
      state.calcRevision++;
      $("calcResult").hidden = true;
      void authStatus()
        .then(() => preferences())
        .then(() => loadContext(true));
    }
    if (area === "session" && changes.radarPanelIntent)
      void loadContext().then(() =>
        applyIntent(changes.radarPanelIntent.newValue),
      );
    if (
      area === "session" &&
      Object.keys(changes).some((k) => k.startsWith("radarContext:"))
    )
      void loadContext();
  });
  chrome.tabs.onActivated.addListener(() => void loadContext());
  chrome.tabs.onUpdated.addListener((_id, change) => {
    if (change.status === "complete" || change.status === "loading")
      void loadContext();
  });
  (async () => {
    await authStatus();
    await preferences();
    await loadContext(true);
  })().catch(() =>
    notice(
      "globalStatus",
      "Não foi possível iniciar o painel. Recarregue a extensão.",
      "error",
    ),
  );
})();
