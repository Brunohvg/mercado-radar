/* One analysis surface. Page data stays useful when optional ML APIs are restricted. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const M = globalThis.RadarPanelModel;
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
    server: "https://radar.optarys.com.br",
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
    state.context?.page === "product" ? state.context.items?.[0] : null;
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
  }
  for (const button of document.querySelectorAll(".tabs button"))
    button.addEventListener("click", () => showTab(button.dataset.tab));
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
      search = state.context?.page === "search";
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
      ? "Vendas totais × preço atual não comprovam faturamento histórico. Sem pedidos da conta, o Radar não afirma lucro ou vendas mensais do concorrente."
      : search
        ? "Use Comparar para selecionar produtos equivalentes. A página do Mercado Livre permanece sem alterações."
        : "O Radar não lê outras abas nem navega por anúncios automaticamente.";
    $("watchCard").hidden = !obs;
    $("calculatorForm").hidden = !obs;
    $("retryApi").hidden = !obs;
    $("evidence").replaceChildren(
      evidenceLine(
        "Página aberta por você",
        "Preço, texto de vendidos e avaliações, quando exibidos.",
      ),
      evidenceLine(
        "Dados privados do vendedor",
        "Pedidos, visitas e estoque dependem da autorização da própria conta. A disponibilidade depende da sua autorização e da oferta consultada.",
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
  }
  async function loadContext(force = false) {
    const context = await chrome.runtime
      .sendMessage({ type: "RADAR_CONTEXT_GET" })
      .catch(() => null);
    const key = JSON.stringify(
      context ? { ...context, updatedAt: null } : null,
    );
    if (!force && key === state.key) return;
    state.key = key;
    state.context = context;
    state.item = null;
    const revision = ++state.revision;
    state.result = null;
    state.calcBusy = false;
    $("calculate").disabled = false;
    $("quoteButton").disabled = false;
    $("marketButton").disabled = false;
    $("retryApi").disabled = false;
    state.candidates = [];
    state.selected.clear();
    $("calcResult").hidden = true;
    $("candidates").replaceChildren();
    $("marketRange").replaceChildren();
    $("sampleNote").textContent = "";
    $("watchButton").disabled = false;
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
    $("listingType").value = "CLASSIC";
    $("logisticType").value = obs?.fulfillment ? "fulfillment" : "drop_off";
    $("manualFees").checked = false;
    $("manualFeeFields").hidden = true;
    if (context?.page === "search") {
      const stored = await chrome.storage.session.get([
        "radarComparisonTarget",
      ]);
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
      state.comparisonTarget = obs;
    }
    if (context?.items?.length && usableQuietly()) {
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
        const insight = response.body.items?.[0];
        if (obs && insight?.estimate?.method === "OFICIAL") {
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
        : "")
    );
  }
  async function calculate(quoteOnly = false, save = false) {
    if (state.calcBusy || !usable()) return;
    let payload;
    try {
      payload = calcPayload(quoteOnly);
    } catch (error) {
      notice("calcStatus", error.message, "error");
      return;
    }
    if (save) payload.save = true;
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
        : save
          ? "Salvando análise…"
          : "Calculando com os parâmetros informados…",
    );
    if (!save) {
      state.result = null;
      $("calcResult").hidden = true;
    }
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
      $("quoteStatus").textContent = quoteText(body);
      if (body.shippingKnown && $("shippingCost").value === "")
        $("shippingCost").value = String(body.fees.shippingCost);
      if (!body.result) {
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
      if (save) {
        notice("calcStatus", "Análise salva no Radar.");
        return;
      }
      state.result = body;
      const r = body.result;
      $("calcResult").hidden = false;
      $("profit").textContent = brl(r.profit);
      $("margin").textContent = pct(r.marginPercent);
      $("roi").textContent = pct(r.roiPercent);
      $("profit").parentElement.classList.toggle("loss", r.profit < 0);
      $("resultSource").textContent =
        body.feeSource === "MANUAL"
          ? "Simulação com tarifas manuais"
          : "Simulação com tarifa da API";
      $("breakdown").replaceChildren();
      const rows = [
        ["Preço de venda", r.salePrice],
        ["Comissão · " + pct(r.commissionPercent), -r.commissionAmount],
        ["Tarifa fixa", -r.fixedFee],
        [
          body.shippingKnown ? "Frete cotado" : "Frete informado",
          -r.shippingCost,
        ],
        ["Imposto · " + pct(r.taxPercent), -r.taxAmount],
        ["Compra · " + payload.kitQuantity + " un.", -r.purchaseCost],
        ["Embalagem e operação", -r.operatingCost],
        ["Lucro simulado", r.profit],
      ];
      for (const [label, value] of rows) {
        const row = node("div");
        row.append(node("dt", label), node("dd", brl(value)));
        $("breakdown").append(row);
      }
      $("priceFloor").textContent =
        "Piso teórico para as metas: " +
        (r.minimumSuggestedPrice == null
          ? "meta inviável com estas taxas"
          : brl(r.minimumSuggestedPrice)) +
        ". Taxas e frete podem mudar ao alterar o preço; consulte novamente.";
      $("calcCaveat").textContent =
        (body.note || "") +
        " Não inclui Ads, devoluções, tributos adicionais ou custos que você não informou.";
      $("saveSimulation").hidden = !(
        body.shippingKnown &&
        body.feeSource === "MERCADO_LIVRE_API" &&
        body.categorySource === "API"
      );
      notice(
        "calcStatus",
        "Simulação concluída. Confira a memória de cálculo abaixo.",
      );
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
        items.filter((i) => Number(i.price) > 0).map((i) => [i.id, i]),
      ).values(),
    ];
    state.selected.clear();
    $("candidates").replaceChildren();
    $("selectAll").hidden = !state.candidates.length;
    for (const item of state.candidates) {
      const row = node("article", null, "candidate"),
        label = node("label", null, "check"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.id;
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
    renderSample();
  }
  function renderSample() {
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
  $("manualFees").addEventListener("change", () => {
    $("manualFeeFields").hidden = !$("manualFees").checked;
  });
  $("quoteButton").addEventListener("click", () => void calculate(true));
  $("saveSimulation").addEventListener(
    "click",
    () => void calculate(false, true),
  );
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
