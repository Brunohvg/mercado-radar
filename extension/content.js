/**
 * Mercado Radar — content script (v0.4)
 *
 * Mudanças em relação à v0.3:
 *  - Toda UI vive em Shadow DOM (nenhum CSS vaza de/para o Mercado Livre).
 *  - O observer ignora mutações causadas pela própria extensão e usa dedupe:
 *    a API é chamada UMA vez por conjunto de anúncios visíveis (antes havia
 *    um ciclo mutação → chamada → mutação que repetia a cada ~700 ms).
 *  - Nenhum dado vindo da API entra via innerHTML (apenas textContent).
 *  - Widget no anúncio (coluna da compra, com fallback flutuante) e faixa de
 *    métricas sob cada card da busca, sem deformar o card do ML.
 *  - Leitura do DOM do ML isolada em selectors.js.
 */
(() => {
  "use strict";

  if (globalThis.__mercadoRadarContent) return;
  globalThis.__mercadoRadarContent = true;

  const S = globalThis.RadarSelectors;
  if (!S) return;

  const OWN = "data-radar-owned";
  const STYLE_URLS = ["ui/tokens.css", "ui/content.css"].map((path) =>
    chrome.runtime.getURL(path),
  );
  const DEBOUNCE_MS = 800;

  const state = {
    lastUrl: location.href,
    timer: null,
    running: false,
    applying: false,
    reordered: false,
    status: "idle", // idle | loading | ok | auth | limit | error
    lastKey: "",
    items: [],
    matches: [],
    economics: new Map(),
    dataVersion: 0,
    strips: new WeakMap(),
    panel: null,
    pdp: null,
    pdpBusy: false,
    launcher: null,
    toast: null,
    dead: false,
  };

  /* ------------------------------------------------------------------ */
  /* utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function h(tag, props, ...children) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === "class") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else element.setAttribute(key, value === true ? "" : String(value));
    }

    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      element.append(child.nodeType ? child : document.createTextNode(String(child)));
    }

    return element;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  function markIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const d of [
      "M4.5 12a7.5 7.5 0 0 1 7.5-7.5",
      "M8 12a4 4 0 0 1 4-4",
      "M12 12l6.5 6.5",
    ]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", "12");
    dot.setAttribute("cy", "12");
    dot.setAttribute("r", "1.6");
    dot.setAttribute("fill", "currentColor");
    svg.append(dot);
    return svg;
  }

  function makeHost(kind) {
    const host = document.createElement("div");
    host.setAttribute(OWN, kind);
    host.style.cssText = "all:initial;display:block;";
    const shadow = host.attachShadow({ mode: "open" });
    for (const href of STYLE_URLS) {
      shadow.append(h("link", { rel: "stylesheet", href }));
    }
    const root = h("div", { class: "rr" });
    shadow.append(root);
    return { host, shadow, root };
  }

  function setVisible(host, visible) {
    host.style.display = visible ? "block" : "none";
  }

  function brl(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function moneyCompact(value) {
    if (!Number.isFinite(value)) return "—";
    const fmt = (n, d) => n.toFixed(d).replace(".", ",");
    if (value >= 1e6) return "R$ " + fmt(value / 1e6, 1) + " mi";
    if (value >= 1e4) return "R$ " + Math.round(value / 1e3) + " mil";
    if (value >= 1e3) return "R$ " + fmt(value / 1e3, 1) + " mil";
    return "R$ " + Math.round(value);
  }

  function pct(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return (
      Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
    );
  }

  function scoreTone(score) {
    if (score >= 65) return "ok";
    if (score >= 45) return "warn";
    return "risk";
  }

  function demandTone(label) {
    if (label === "EXCELENTE" || label === "ALTA") return "ok";
    if (label === "MEDIA") return "warn";
    if (label === "BAIXA") return "risk";
    return "";
  }

  function logisticText(type) {
    const map = {
      fulfillment: "Full",
      self_service: "Flex",
      cross_docking: "Coleta",
      xd_drop_off: "Agência",
      drop_off: "Agência",
    };
    return map[type] || type || "";
  }

  function demandText(label) {
    const map = {
      EXCELENTE: "Excelente",
      ALTA: "Alta",
      MEDIA: "Média",
      BAIXA: "Baixa",
    };
    return map[label] || "—";
  }

  async function send(path, method = "GET", body) {
    try {
      return await chrome.runtime.sendMessage({
        type: "RADAR_FETCH",
        path,
        method,
        body,
      });
    } catch {
      // Extensão recarregada/atualizada: este script ficou órfão.
      state.dead = true;
      observer.disconnect();
      return {
        ok: false,
        status: 0,
        contextLost: true,
        body: { error: "O Radar foi atualizado. Recarregue esta página." },
      };
    }
  }

  async function getSettings() {
    const stored = await chrome.storage.sync.get([
      "radarTaxPercent",
      "radarOperatingCost",
      "radarTargetMarginPercent",
      "radarTargetRoiPercent",
      "radarApiBase",
    ]);

    return {
      taxPercent: Number(stored.radarTaxPercent || 0),
      operatingCost: Number(stored.radarOperatingCost || 0),
      targetMarginPercent: Number(stored.radarTargetMarginPercent || 20),
      targetRoiPercent: Number(stored.radarTargetRoiPercent || 30),
      apiBase: stored.radarApiBase || "https://radar.optarys.com.br",
    };
  }

  async function login() {
    try {
      return await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGIN" });
    } catch {
      return { authenticated: false, error: "Recarregue a página e tente novamente." };
    }
  }

  function titleScore(a, b) {
    const left = new Set(S.normalize(a).split(" ").filter((t) => t.length > 1));
    const right = new Set(S.normalize(b).split(" ").filter((t) => t.length > 1));
    if (!left.size || !right.size) return 0;

    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection += 1;
    return intersection / Math.max(left.size, right.size);
  }

  function matchItems(cards, items) {
    const remaining = new Set(items.map((_, index) => index));
    const matches = [];

    for (const card of cards) {
      const cardTitle = S.cardTitle(card);
      const cardPrice = S.cardPrice(card);
      const directRef = S.cardReference(card);

      let bestIndex = -1;
      let bestScore = -1;

      items.forEach((item, index) => {
        if (!remaining.has(index)) return;

        let score = titleScore(cardTitle, item.title);
        if (directRef === item.id || directRef === item.userProductId) score += 2;

        if (cardPrice && item.price) {
          const gap =
            Math.abs(cardPrice - item.price) / Math.max(cardPrice, item.price);
          score += Math.max(0, 0.45 - gap);
        }

        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestIndex >= 0 && bestScore >= 0.48) {
        remaining.delete(bestIndex);
        matches.push({ card, item: items[bestIndex], cardPrice });
      }
    }

    return matches;
  }

  /* ------------------------------------------------------------------ */
  /* faixa sob cada card da busca                                        */
  /* ------------------------------------------------------------------ */

  function stat(label, value, estimate, tone) {
    return h(
      "div",
      { class: "stat" },
      h("small", { text: label }),
      h("b", { class: tone || "" }, value, estimate ? h("span", { class: "est", text: "*" }) : null),
    );
  }

  function renderStrip(root, item, price, econ) {
    const intel = item.intelligence || {};
    const score = Number(intel.score ?? 0);
    const sales = intel.salesPerMonth;
    const unitPrice = price || item.price || 0;
    const revenue = sales == null || !unitPrice ? null : sales * unitPrice;

    const children = [
      h(
        "div",
        { class: "strip__head" },
        h("span", { class: "brand" }, markIcon(), "Radar"),
        h("span", { class: "chip chip--" + scoreTone(score), text: "Score " + score }),
      ),
      h(
        "div",
        { class: "strip__grid" },
        stat("Vendas/mês", sales == null ? "—" : "~" + Math.round(sales), true),
        stat("Faturamento", moneyCompact(revenue), true),
        stat("Demanda", demandText(intel.demandLabel), false, demandTone(intel.demandLabel)),
      ),
    ];

    if (item.momentum?.status === "READY") {
      children.push(
        h(
          "div",
          { class: "strip__mine" },
          h("span", { text: "Momentum" }),
          h("b", { text: item.momentum.score + "/100 · " + item.momentum.direction }),
        ),
      );
    }

    if (econ) {
      const good = Number(econ.marginPercent) >= 15;
      children.push(
        h(
          "div",
          { class: "strip__mine" },
          h("span", { text: "Minha margem" }),
          h("span", {
            class: "chip chip--" + (good ? "ok" : "risk"),
            text: pct(econ.marginPercent) + " · " + brl(econ.profit),
          }),
        ),
      );
    }

    children.push(
      h("div", { class: "strip__foot", text: "* estimativa pela faixa de vendas do anúncio" }),
    );

    root.replaceChildren(h("div", { class: "strip" }, ...children));
  }

  function ensureStrip(card, item, price, econ) {
    const signature = item.id + "|" + state.dataVersion;
    let record = state.strips.get(card);

    if (!record) {
      const made = makeHost("strip");
      record = {
        host: made.host,
        root: made.root,
        mode: card.tagName === "LI" ? "inside" : "after",
        signature: "",
      };
      state.strips.set(card, record);
    }

    if (!record.host.isConnected) {
      if (record.mode === "inside") card.appendChild(record.host);
      else card.insertAdjacentElement("afterend", record.host);
    }

    if (record.signature !== signature) {
      renderStrip(record.root, item, price, econ);
      record.signature = signature;
    }
  }

  function decorateCard(card, item, price, econ) {
    const intel = item.intelligence || {};
    const sales = intel.salesPerMonth;
    const unitPrice = price || item.price || 0;
    const revenue = sales == null || !unitPrice ? null : sales * unitPrice;

    card.dataset.radarScore = String(intel.score ?? 0);
    card.dataset.radarDemand = intel.demandLabel || "BAIXA";
    card.dataset.radarSales = String(sales ?? 0);
    card.dataset.radarRevenue = String(revenue ?? 0);
    card.dataset.radarAge = String(intel.ageDays ?? 999999);
    card.dataset.radarFreeShipping = item.freeShipping ? "1" : "0";
    card.dataset.radarMomentum = String(
      item.momentum?.status === "READY" ? (item.momentum.score ?? -1) : -1,
    );
    card.dataset.radarItemId = item.id;
    card.dataset.radarMyMargin = String(econ?.marginPercent ?? -999);
    card.dataset.radarMyRoi = String(econ?.roiPercent ?? -999);
    card.dataset.radarMyProfit = String(econ?.profit ?? 0);

    ensureStrip(card, item, price, econ);
  }

  /* idempotente: pode rodar quantas vezes quiser sem chamar a API */
  function applyMatches(cards) {
    state.matches = matchItems(cards, state.items);
    for (const match of state.matches) {
      decorateCard(
        match.card,
        match.item,
        match.cardPrice,
        state.economics.get(match.item.id) || null,
      );
    }
    applyFilters();
  }

  /* ------------------------------------------------------------------ */
  /* painel de filtros                                                   */
  /* ------------------------------------------------------------------ */

  const FILTERS = {
    score: ["Score mínimo", [["0", "Todas"], ["50", "Score 50+"], ["65", "Score 65+"], ["80", "Score 80+"]]],
    demand: ["Demanda", [["", "Todas"], ["EXCELENTE", "Excelente"], ["ALTA", "Alta"], ["MEDIA", "Média"], ["BAIXA", "Baixa"]]],
    sort: ["Ordenar", [["original", "Ordem do Mercado Livre"], ["score", "Melhor oportunidade"], ["sales", "Mais vendidos"], ["revenue", "Maior faturamento"], ["newest", "Mais novos"], ["momentum", "Maior momentum"], ["myMargin", "Maior margem para mim"], ["myRoi", "Maior ROI para mim"]]],
    sales: ["Vendas estimadas/mês", [["0", "Todas"], ["10", "10+"], ["50", "50+"], ["100", "100+"], ["300", "300+"]]],
    revenue: ["Faturamento estimado", [["0", "Todos"], ["1000", "R$ 1 mil+"], ["5000", "R$ 5 mil+"], ["10000", "R$ 10 mil+"], ["50000", "R$ 50 mil+"]]],
    age: ["Idade máxima", [["999999", "Qualquer"], ["30", "30 dias"], ["90", "90 dias"], ["365", "1 ano"]]],
    momentum: ["Momentum monitorado", [["-1", "Qualquer"], ["50", "50+"], ["70", "70+"], ["85", "85+"]]],
    myMargin: ["Minha margem", [["-999", "Qualquer"], ["10", "10%+"], ["15", "15%+"], ["20", "20%+"], ["30", "30%+"]]],
    myRoi: ["Meu ROI", [["-999", "Qualquer"], ["20", "20%+"], ["30", "30%+"], ["50", "50%+"], ["80", "80%+"]]],
  };

  function filterSelect(name, disabled) {
    const [label, options] = FILTERS[name];
    const select = h("select", { "data-f": name, disabled: Boolean(disabled) });
    for (const [value, text] of options) select.append(h("option", { value, text }));
    return h("label", { class: "field" }, h("span", { text: label }), select);
  }

  function section(title, open, ...children) {
    return h("details", { class: "sec", open: Boolean(open) }, h("summary", { text: title }), ...children);
  }

  function buildPanel() {
    const { host, root } = makeHost("panel");

    const count = h("span", { class: "panel__count" });
    const notice = h("div", { class: "notice", hidden: true });
    const mineStatus = h("small", { text: "Usa o custo cadastrado no seu produto mais compatível." });
    const mineButton = h("button", {
      class: "btn btn--block",
      type: "button",
      text: "Calcular minha margem",
      onClick: () => void loadSearchProfitability(),
    });

    const panel = h(
      "section",
      { class: "panel", "aria-label": "Filtros do Mercado Radar" },
      h(
        "div",
        { class: "panel__head" },
        h("span", { class: "brand" }, markIcon(), "Radar"),
        count,
        h("button", { class: "link", type: "button", text: "Limpar", onClick: resetFilters }),
      ),
      notice,
      h(
        "div",
        { class: "panel__body" },
        section("Oportunidade", true, filterSelect("score"), filterSelect("demand"), filterSelect("sort")),
        section("Volume e idade", false, filterSelect("sales"), filterSelect("revenue"), filterSelect("age"), filterSelect("momentum")),
        section(
          "Logística",
          false,
          h("label", { class: "check" }, h("input", { type: "checkbox", "data-f": "freeShipping" }), "Só frete grátis"),
        ),
        section(
          "Para minha operação",
          true,
          h("div", { class: "mine-box" }, mineButton, mineStatus),
          filterSelect("myMargin", true),
          filterSelect("myRoi", true),
        ),
      ),
    );

    panel.addEventListener("change", () => applyFilters());
    root.append(panel);

    return { host, root, count, notice, mineButton, mineStatus };
  }

  function mountPanel() {
    if (state.panel?.host.isConnected) return;

    if (!state.panel) state.panel = buildPanel();
    const { host } = state.panel;

    const sidebar = S.findSidebar();
    if (sidebar) {
      sidebar.prepend(host);
    } else {
      host.style.setProperty("position", "fixed");
      host.style.setProperty("z-index", "2147483000");
      host.style.setProperty("left", "12px");
      host.style.setProperty("top", "120px");
      host.style.setProperty("width", "260px");
      host.style.setProperty("max-height", "calc(100vh - 140px)");
      host.style.setProperty("overflow", "auto");
      document.body.appendChild(host);
    }
  }

  function setNotice(kind, message, actionLabel, action) {
    const notice = state.panel?.notice;
    if (!notice) return;

    if (!kind || kind === "ok") {
      notice.hidden = true;
      notice.replaceChildren();
      return;
    }

    const tone = kind === "error" ? " notice--risk" : kind === "limit" ? " notice--warn" : "";
    notice.className = "notice" + tone;
    notice.hidden = false;
    // replaceChildren(null) inseriria o texto "null": monta só com nós reais.
    const nodes = [h("div", { text: message })];
    if (actionLabel) {
      nodes.push(h("button", { class: "btn btn--block", type: "button", text: actionLabel, onClick: action }));
    }
    notice.replaceChildren(...nodes);
  }

  function resetFilters() {
    const root = state.panel?.root;
    if (!root) return;
    root.querySelectorAll("select").forEach((select) => {
      select.selectedIndex = 0;
    });
    const free = root.querySelector("[data-f='freeShipping']");
    if (free) free.checked = false;
    applyFilters();
  }

  function applyFilters() {
    const root = state.panel?.root;
    if (!root) return;

    const control = (name) => root.querySelector(`[data-f="${name}"]`);
    const num = (name, fallback) => Number(control(name)?.value ?? fallback);

    const score = num("score", 0);
    const demand = control("demand")?.value || "";
    const sales = num("sales", 0);
    const revenue = num("revenue", 0);
    const age = num("age", 999999);
    const momentum = num("momentum", -1);
    const myMargin = num("myMargin", -999);
    const myRoi = num("myRoi", -999);
    const freeShipping = Boolean(control("freeShipping")?.checked);
    const sort = control("sort")?.value || "original";

    const cards = S.findCards();
    state.applying = true;

    try {
      let visibleCount = 0;

      cards.forEach((card, index) => {
        if (!card.dataset.radarOriginalIndex) {
          card.dataset.radarOriginalIndex = String(index);
        }

        const d = card.dataset;
        const visible =
          Number(d.radarScore || 0) >= score &&
          (!demand || d.radarDemand === demand) &&
          Number(d.radarSales || 0) >= sales &&
          Number(d.radarRevenue || 0) >= revenue &&
          Number(d.radarAge || 999999) <= age &&
          Number(d.radarMomentum ?? -1) >= momentum &&
          (!freeShipping || d.radarFreeShipping === "1") &&
          Number(d.radarMyMargin ?? -999) >= myMargin &&
          Number(d.radarMyRoi ?? -999) >= myRoi;

        card.style.display = visible ? "" : "none";
        const strip = state.strips.get(card);
        if (strip) setVisible(strip.host, visible);
        if (visible) visibleCount += 1;
      });

      if (state.panel) {
        state.panel.count.textContent = visibleCount + " de " + cards.length;
      }

      const parents = new Set(cards.map((card) => card.parentElement).filter(Boolean));
      const mustSort = sort !== "original" || state.reordered;

      if (mustSort && parents.size === 1) {
        const parent = [...parents][0];
        const read = (card, key, fallback) => Number(card.dataset[key] ?? fallback);

        const sorted = [...cards].sort((a, b) => {
          switch (sort) {
            case "score": return read(b, "radarScore", 0) - read(a, "radarScore", 0);
            case "sales": return read(b, "radarSales", 0) - read(a, "radarSales", 0);
            case "revenue": return read(b, "radarRevenue", 0) - read(a, "radarRevenue", 0);
            case "newest": return read(a, "radarAge", 999999) - read(b, "radarAge", 999999);
            case "momentum": return read(b, "radarMomentum", -1) - read(a, "radarMomentum", -1);
            case "myMargin": return read(b, "radarMyMargin", -999) - read(a, "radarMyMargin", -999);
            case "myRoi": return read(b, "radarMyRoi", -999) - read(a, "radarMyRoi", -999);
            default: return read(a, "radarOriginalIndex", 0) - read(b, "radarOriginalIndex", 0);
          }
        });

        for (const card of sorted) {
          parent.appendChild(card);
          const strip = state.strips.get(card);
          if (strip && strip.mode === "after") parent.appendChild(strip.host);
        }

        state.reordered = sort !== "original";
      }
    } finally {
      // Descarta as mutações geradas aqui: não podem disparar novo ciclo.
      observer.takeRecords();
      state.applying = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* "para minha operação"                                               */
  /* ------------------------------------------------------------------ */

  async function loadSearchProfitability() {
    const panel = state.panel;
    if (!panel) return;

    const query = S.extractQuery();
    const items = state.matches
      .map((match) => ({
        id: match.item.id,
        price: match.cardPrice || match.item.price || 0,
      }))
      .filter((item) => item.price > 0)
      .slice(0, 12);

    if (!query || !items.length) return;

    panel.mineButton.disabled = true;
    panel.mineButton.textContent = "Calculando...";
    panel.mineStatus.textContent = "Procurando seu produto e custo no Radar...";

    const settings = await getSettings();
    const response = await send("/api/extension/search-profitability", "POST", {
      query,
      items,
      taxPercent: settings.taxPercent,
      operatingCost: settings.operatingCost,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
    });

    const retry = (label) => {
      panel.mineButton.disabled = false;
      panel.mineButton.textContent = label;
    };

    if (!response?.ok) {
      panel.mineStatus.textContent =
        response?.body?.error || "Não foi possível calcular sua margem.";
      retry("Calcular minha margem");
      return;
    }

    if (response.body?.needsCost) {
      panel.mineStatus.textContent =
        response.body.message ||
        "Encontrei seu produto, mas falta cadastrar o custo.";
      retry("Tentar novamente");
      return;
    }

    if (!Array.isArray(response.body?.items) || !response.body.items.length) {
      panel.mineStatus.textContent =
        response.body?.message ||
        "Nenhum produto seu compatível foi encontrado para esta busca.";
      retry("Calcular minha margem");
      return;
    }

    for (const economics of response.body.items) {
      state.economics.set(economics.id, economics);
    }
    state.dataVersion += 1;

    panel.root.querySelectorAll("[data-f='myMargin'], [data-f='myRoi']").forEach((el) => {
      el.disabled = false;
    });

    const matched = response.body.matchedProduct;
    panel.mineStatus.textContent = matched
      ? "Usando custo de " + matched.title + " · confiança " + matched.similarityPercent + "%"
      : "Margem personalizada carregada.";
    panel.mineButton.textContent = "Minha margem carregada";

    applyMatches(S.findCards());
  }

  /* ------------------------------------------------------------------ */
  /* busca: enriquecimento com dedupe                                    */
  /* ------------------------------------------------------------------ */

  function buildObserved(cards) {
    return cards
      .map((card, index) => {
        const id = S.cardReference(card);
        if (!id || !/^MLB\d+$/i.test(id)) return null;

        const shipping = S.cardShipping(card);
        return {
          id,
          title: S.cardTitle(card),
          price: S.cardPrice(card),
          position: index + 1,
          soldQuantityLowerBound: S.cardSoldLowerBound(card),
          freeShipping: shipping.freeShipping,
          logisticType: shipping.logisticType,
        };
      })
      .filter(Boolean)
      .slice(0, 50);
  }

  function forceRefresh() {
    state.lastKey = "";
    state.status = "idle";
    schedule(50);
  }

  async function enrichSearch() {
    if (state.running || state.dead) return;

    const cards = S.findCards();
    const query = S.extractQuery();

    if (!query || cards.length < 2) {
      await enrichProduct();
      return;
    }

    const observed = buildObserved(cards);
    if (!observed.length) return;

    const key = query + "|" + observed.map((item) => item.id).join(",");

    if (key === state.lastKey) {
      // Mesmo conjunto de anúncios: nunca chama a API de novo. Só garante que a
      // interface continue montada (o ML pode ter re-renderizado os cards).
      if (cards.length >= 3) mountPanel();
      if (state.status === "ok") applyMatches(cards);
      return;
    }

    state.running = true;
    state.lastKey = key;
    state.status = "loading";
    state.economics.clear();
    publishContext();

    try {
      if (cards.length >= 3) mountPanel();
      setNotice("loading", "Analisando anúncios...");

      const response = await send("/api/extension/search", "POST", {
        query,
        items: observed,
      });

      if (response.contextLost) return;

      if (response.status === 401) {
        state.status = "auth";
        setNotice(
          "auth",
          "Entre no Mercado Radar para ver score, vendas e margem nesta busca.",
          "Entrar no Mercado Radar",
          async () => {
            const result = await login();
            if (result?.authenticated) forceRefresh();
            else setNotice("error", result?.error || "Não foi possível entrar.", "Tentar de novo", forceRefresh);
          },
        );
        return;
      }

      if (response.status === 429) {
        state.status = "limit";
        setNotice("limit", response.body?.error || "Limite diário da extensão atingido.");
        return;
      }

      if (!response.ok || !Array.isArray(response.body?.items)) {
        state.status = "error";
        setNotice(
          "error",
          response.body?.error || "Não foi possível analisar esta busca.",
          "Tentar de novo",
          forceRefresh,
        );
        return;
      }

      state.status = "ok";
      state.items = response.body.items;
      state.dataVersion += 1;
      setNotice("ok");
      applyMatches(cards);
    } finally {
      state.running = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* anúncio: widget                                                     */
  /* ------------------------------------------------------------------ */

  function kpi(label, value, tone) {
    return h("div", { class: "kpi" }, h("small", { text: label }), h("b", { class: tone || "", text: value }));
  }

  function createPdp(ref) {
    const { host, root } = makeHost("widget");
    const body = h("div", { class: "widget__body" });
    const chip = h("span", { class: "chip", hidden: true });
    const chevron = h("span", { class: "muted", text: "▾" });

    const head = h(
      "div",
      {
        class: "widget__head",
        role: "button",
        tabindex: "0",
        "aria-expanded": "true",
      },
      h("span", { class: "brand" }, markIcon(), "Mercado Radar"),
      h("span", { style: "display:flex;gap:8px;align-items:center" }, chip, chevron),
    );

    const toggle = () => {
      body.hidden = !body.hidden;
      chevron.textContent = body.hidden ? "▸" : "▾";
      head.setAttribute("aria-expanded", String(!body.hidden));
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });

    const wrap = h("section", { class: "widget", "aria-label": "Análise do Mercado Radar" }, head, body);
    root.append(wrap);

    return { ref, host, root, wrap, body, chip, item: null, cost: null, floating: false };
  }

  function mountPdp() {
    const pdp = state.pdp;
    if (!pdp || pdp.host.isConnected) return;

    const anchor = S.findPdpAnchor();
    if (anchor) {
      anchor.element.insertAdjacentElement(anchor.position, pdp.host);
      pdp.floating = false;
      pdp.wrap.classList.remove("widget--floating");
    } else {
      pdp.floating = true;
      pdp.wrap.classList.add("widget--floating");
      document.body.appendChild(pdp.host);
    }
  }

  function pdpMessage(pdp, tone, message, actionLabel, action) {
    pdp.body.replaceChildren(
      h(
        "div",
        { class: "notice" + (tone === "error" ? " notice--risk" : tone === "limit" ? " notice--warn" : ""), style: "margin:0" },
        h("div", { text: message }),
        actionLabel ? h("button", { class: "btn btn--block", type: "button", text: actionLabel, onClick: action }) : null,
      ),
    );
  }

  function payoutBlock(pdp, calc) {
    const { fees, result } = calc;
    const hasCost = pdp.cost != null;

    const line = (label, value, className) =>
      h("div", { class: "line" + (className ? " " + className : "") }, h("span", { text: label }), h("b", { text: value }));

    const lines = [
      line("Preço de venda", brl(result.salePrice)),
      line("Comissão (" + pct(fees.commissionPercent) + ")", "− " + brl(fees.commissionAmount), "neg"),
    ];
    if (Number(fees.fixedFee) > 0) lines.push(line("Tarifa fixa", "− " + brl(fees.fixedFee), "neg"));
    lines.push(line("Frete", "− " + brl(fees.shippingCost), "neg"));
    if (Number(fees.taxAmount) > 0) lines.push(line("Imposto (" + pct(fees.taxPercent) + ")", "− " + brl(fees.taxAmount), "neg"));
    lines.push(line("Você recebe", brl(result.amountReceived), "total"));

    if (hasCost) {
      lines.push(line("Custo do produto", "− " + brl(result.purchaseCost), "neg"));
      lines.push(line("Lucro por venda", brl(result.profit), "total" + (result.profit <= 0 ? " risk" : "")));
    }

    const costInput = h("input", {
      type: "number",
      min: "0",
      step: "0.01",
      placeholder: "Meu custo (R$)",
      value: hasCost ? String(pdp.cost) : null,
      "aria-label": "Custo do produto",
    });
    const costButton = h("button", {
      class: "btn",
      type: "button",
      text: hasCost ? "Recalcular" : "Calcular lucro",
      onClick: async () => {
        const value = Number(costInput.value);
        if (!Number.isFinite(value) || value < 0 || costInput.value === "") return;
        costButton.disabled = true;
        costButton.textContent = "Calculando...";
        pdp.cost = value;
        await loadPdpCalculation(pdp);
      },
    });

    return h(
      "div",
      { class: "block" },
      h("div", { class: "block__title", text: "Quanto você recebe" }),
      h("div", { class: "payout" }, ...lines),
      h("div", { class: "cost-row" }, costInput, costButton),
      hasCost
        ? h("div", { class: "muted", style: "margin-top:8px", text: "Margem " + pct(result.marginPercent) + " · ROI " + pct(result.roiPercent) + " · preço mínimo saudável " + brl(result.minimumSuggestedPrice) })
        : h("div", { class: "muted", style: "margin-top:8px", text: "Informe seu custo para ver lucro, margem e ROI." }),
    );
  }

  function renderPdp(pdp, calc) {
    const item = pdp.item;
    const intel = item.intelligence || {};
    const score = Number(intel.score ?? 0);

    pdp.chip.hidden = false;
    pdp.chip.className = "chip chip--" + scoreTone(score);
    pdp.chip.textContent = "Score " + score;

    const margin = calc && pdp.cost != null ? calc.result.marginPercent : null;
    const marginTone = margin == null ? "" : margin >= 15 ? "ok" : "risk";

    const blocks = [
      h(
        "div",
        { class: "kpis" },
        kpi("Score", score + "/100", scoreTone(score)),
        kpi("Vendas/mês*", intel.salesPerMonth == null ? "—" : "~" + Math.round(intel.salesPerMonth)),
        kpi("Demanda", demandText(intel.demandLabel), demandTone(intel.demandLabel)),
        kpi("Minha margem", margin == null ? "—" : pct(margin), marginTone),
      ),
    ];

    if (calc) blocks.push(payoutBlock(pdp, calc));

    const winner = pdp.catalog?.buyBoxWinner;
    if (winner?.price) {
      const delta = item.price ? ((item.price - winner.price) / winner.price) * 100 : null;
      blocks.push(
        h(
          "div",
          { class: "block rows" },
          h("div", { class: "block__title", text: "Buy Box do catálogo" }),
          h("div", { class: "row" }, h("span", { text: "Vencedor" }), h("b", { text: brl(winner.price) })),
          h("div", {
            class: "muted",
            text:
              (winner.logisticType ? logisticText(winner.logisticType) + " · " : "") +
              (winner.freeShipping ? "frete grátis" : "frete não grátis") +
              (delta == null ? "" : " · este anúncio " + (delta >= 0 ? "+" : "") + pct(delta)),
          }),
        ),
      );
    }

    pdp.marketSlot = h("div", { class: "block" });
    blocks.push(pdp.marketSlot);
    blocks.push(
      h("div", { class: "muted", style: "margin-top:10px", text: "* estimativa pela faixa de vendas do anúncio" }),
      h(
        "div",
        { style: "margin-top:10px" },
        h("button", {
          class: "btn btn--ghost btn--block",
          type: "button",
          text: "Monitorar este anúncio",
          onClick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = "Salvando...";
            const response = await send("/api/extension/watchlist", "POST", {
              itemId: item.id,
              referenceId: pdp.ref || item.id,
            });
            button.disabled = false;
            button.textContent = response?.ok
              ? "Monitorando ✓"
              : response?.body?.error || "Falha ao salvar — tentar novamente";
          },
        }),
      ),
    );

    pdp.body.replaceChildren(...blocks);
    renderMarketButton(pdp);
  }

  function renderMarketButton(pdp) {
    pdp.marketSlot.replaceChildren(
      h("button", {
        class: "btn btn--ghost btn--block",
        type: "button",
        text: "Ver faixa de preço e concorrentes",
        onClick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = "Carregando...";
          await loadPdpMarket(pdp);
        },
      }),
    );
  }

  async function loadPdpMarket(pdp) {
    const item = pdp.item;
    const params = new URLSearchParams({
      title: item.title,
      itemId: item.id,
      currentPrice: String(item.price || 0),
    });
    if (item.categoryId) params.set("categoryId", item.categoryId);

    const response = await send("/api/extension/market?" + params.toString());

    if (!response?.ok || !response.body?.market) {
      pdp.marketSlot.replaceChildren(
        h("div", { class: "muted", text: response?.body?.error || "Sem dados de mercado para este anúncio." }),
      );
      return;
    }

    const market = response.body.market;
    const competitors = Array.isArray(response.body.competitors) ? response.body.competitors : [];

    pdp.marketSlot.replaceChildren(
      h("div", { class: "block__title", text: "Faixa de preço do mercado" }),
      h(
        "div",
        { class: "kpis", style: "grid-template-columns:repeat(3,minmax(0,1fr))" },
        kpi("P25", brl(market.p25, 0)),
        kpi("Mediana", brl(market.median, 0)),
        kpi("P75", brl(market.p75, 0)),
      ),
      h("div", {
        class: "muted",
        style: "margin-top:6px",
        text:
          market.count +
          " comparáveis · " +
          (market.gapToMedian == null
            ? "sem comparação"
            : "este anúncio " + (market.gapToMedian >= 0 ? "+" : "") + pct(market.gapToMedian) + " vs mediana"),
      }),
      competitors.length
        ? h(
            "div",
            { class: "rows", style: "margin-top:8px" },
            ...competitors.slice(0, 4).map((c) =>
              h("div", { class: "row" }, h("span", { text: c.title }), h("b", { text: brl(c.price) })),
            ),
          )
        : null,
    );
  }

  async function loadPdpCalculation(pdp) {
    const settings = await getSettings();
    const response = await send("/api/extension/profitability", "POST", {
      itemId: pdp.item.id,
      supplierPrice: pdp.cost ?? 0,
      discountPercent: 0,
      kitQuantity: 1,
      taxPercent: settings.taxPercent,
      operatingCost: pdp.cost == null ? 0 : settings.operatingCost,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
    });

    if (!response?.ok || !response.body?.result) {
      renderPdp(pdp, null);
      pdp.body.append(
        h("div", { class: "muted", style: "margin-top:10px", text: response?.body?.error || "Não foi possível calcular taxas deste anúncio." }),
      );
      return;
    }

    renderPdp(pdp, response.body);
  }

  async function loadPdp(pdp) {
    pdp.body.replaceChildren(
      h("div", { class: "skeleton" }),
      h("div", { class: "skeleton", style: "width:70%" }),
      h("div", { class: "skeleton", style: "width:85%" }),
    );

    const params = new URLSearchParams({ id: pdp.ref });
    const price = S.pagePrice();
    if (price) params.set("visiblePrice", String(price));

    const response = await send("/api/extension/item?" + params.toString());
    if (response.contextLost) return;

    if (response.status === 401) {
      pdpMessage(pdp, "info", "Entre no Mercado Radar para ver margem, demanda e concorrência deste anúncio.", "Entrar no Mercado Radar", async () => {
        const result = await login();
        if (result?.authenticated) void loadPdp(pdp);
        else pdpMessage(pdp, "error", result?.error || "Não foi possível entrar.", "Tentar de novo", () => void loadPdp(pdp));
      });
      return;
    }

    if (response.status === 429) {
      pdpMessage(pdp, "limit", response.body?.error || "Limite diário da extensão atingido.");
      return;
    }

    if (!response.ok || !response.body?.item) {
      pdpMessage(pdp, "error", response.body?.error || "Não foi possível analisar este anúncio.", "Tentar de novo", () => void loadPdp(pdp));
      return;
    }

    pdp.item = response.body.item;
    pdp.catalog = response.body.catalog || null;
    renderPdp(pdp, null);

    // Custo cadastrado no Radar (produto seu mais compatível), se existir.
    const settings = await getSettings();
    const mine = await send("/api/extension/search-profitability", "POST", {
      query: pdp.item.title,
      items: [{ id: pdp.item.id, price: pdp.item.price }],
      taxPercent: settings.taxPercent,
      operatingCost: settings.operatingCost,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
    });

    const matched = mine?.ok ? mine.body?.matchedProduct : null;
    if (matched && matched.hasCost !== false && matched.unitCost != null) {
      pdp.cost = Number(matched.unitCost);
    }

    await loadPdpCalculation(pdp);
  }

  async function enrichProduct() {
    publishContext();

    const ref = S.currentReference();
    if (!ref || !S.isProductPage()) return;

    if (state.pdp && state.pdp.ref === ref) {
      mountPdp(); // idempotente: só recoloca se o ML removeu o widget
      return;
    }

    if (state.pdpBusy) return;
    state.pdpBusy = true;

    try {
      state.pdp?.host.remove();
      state.pdp = createPdp(ref);
      mountPdp();
      await loadPdp(state.pdp);
    } finally {
      state.pdpBusy = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* lançador, menu, configurações e aviso de compatibilidade            */
  /* ------------------------------------------------------------------ */

  function isValidGtin(raw) {
    const code = String(raw).replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(code.length)) return null;
    const digits = code.split("").map(Number);
    const check = digits.pop();
    let sum = 0;
    let weight = 3;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      sum += digits[i] * weight;
      weight = weight === 3 ? 1 : 3;
    }
    return (10 - (sum % 10)) % 10 === check ? code : null;
  }

  function mountLauncher() {
    if (state.launcher?.host.isConnected) return;
    if (!document.body) return;

    const { host, root } = makeHost("launcher");
    host.style.cssText = "all:initial;";

    const menu = h("div", { class: "menu", hidden: true, role: "menu" });
    const sub = h("div", { class: "menu__sub", hidden: true });

    const closeMenu = () => {
      menu.hidden = true;
      sub.hidden = true;
    };

    const showSub = (...nodes) => {
      sub.hidden = false;
      sub.replaceChildren(...nodes);
    };

    const item = (title, hint, onClick) =>
      h("button", { class: "menu__item", type: "button", role: "menuitem", onClick }, title, hint ? h("small", { text: hint }) : null);

    menu.append(
      item("Calculadora de lucro", "Abra no anúncio que quer analisar", () => {
        if (state.pdp?.host.isConnected) {
          state.pdp.body.hidden = false;
          state.pdp.host.scrollIntoView({ behavior: "smooth", block: "center" });
          closeMenu();
        } else {
          showSub(h("div", { class: "muted", text: "Abra um anúncio do Mercado Livre para calcular comissão, frete e lucro." }));
        }
      }),
      item("Pesquisa por EAN", "Valida o código e busca no Mercado Livre", () => {
        const input = h("input", { type: "text", inputmode: "numeric", placeholder: "EAN / GTIN (8, 12, 13 ou 14 dígitos)", "aria-label": "Código EAN" });
        const message = h("div", { class: "muted", style: "margin-top:6px" });
        showSub(
          input,
          message,
          h("button", {
            class: "btn btn--block",
            type: "button",
            text: "Buscar",
            onClick: () => {
              const code = isValidGtin(input.value);
              if (!code) {
                message.textContent = "Código inválido: confira os dígitos (dígito verificador não confere).";
                return;
              }
              location.href = "https://lista.mercadolivre.com.br/" + encodeURIComponent(code);
            },
          }),
        );
      }),
      item("Configurações", "Imposto, custo operacional e metas", async () => {
        const settings = await getSettings();
        const field = (label, key, value, step) => {
          const input = h("input", { type: "number", min: "0", step, value: String(value), "data-key": key });
          return { input, node: h("label", { class: "field" }, h("span", { text: label }), input) };
        };
        const fields = [
          field("Imposto %", "radarTaxPercent", settings.taxPercent, "0.1"),
          field("Custo operacional (R$)", "radarOperatingCost", settings.operatingCost, "0.01"),
          field("Margem alvo %", "radarTargetMarginPercent", settings.targetMarginPercent, "1"),
          field("ROI alvo %", "radarTargetRoiPercent", settings.targetRoiPercent, "1"),
        ];
        const status = h("div", { class: "muted", style: "margin-top:6px" });
        showSub(
          ...fields.map((f) => f.node),
          h("button", {
            class: "btn btn--block",
            type: "button",
            text: "Salvar",
            onClick: async () => {
              const values = {};
              for (const f of fields) values[f.input.dataset.key] = Math.max(0, Number(f.input.value) || 0);
              await chrome.storage.sync.set(values);
              status.textContent = "Salvo. Vale para os próximos cálculos.";
            },
          }),
          status,
        );
      }),
      item("Painel Mercado Radar", "Abre o painel completo", async () => {
        const settings = await getSettings();
        window.open(settings.apiBase, "_blank", "noopener");
        closeMenu();
      }),
      sub,
    );

    const button = h(
      "button",
      {
        class: "launcher__btn",
        type: "button",
        "aria-label": "Abrir menu do Mercado Radar",
        "aria-haspopup": "menu",
        onClick: () => {
          menu.hidden = !menu.hidden;
          sub.hidden = true;
        },
      },
      markIcon(),
    );

    root.append(h("div", { class: "launcher" }, menu, button));
    document.body.appendChild(host);
    state.launcher = { host };
  }

  function runHealthCheck() {
    if (state.dead || state.toast) return;
    const result = S.healthCheck();
    if (result.ok) return;

    console.warn("[Mercado Radar] layout do Mercado Livre pode ter mudado:", result.problems);

    const { host, root } = makeHost("toast");
    host.style.cssText = "all:initial;";
    root.append(
      h(
        "div",
        { class: "toast", role: "status" },
        h("b", { text: "O layout do Mercado Livre mudou. " }),
        "Alguns dados podem não aparecer até o Radar ser atualizado.",
        h("div", { style: "margin-top:6px" }, h("button", { class: "link", type: "button", text: "Fechar", onClick: () => host.remove() })),
      ),
    );
    document.body.appendChild(host);
    state.toast = host;
  }

  /* ------------------------------------------------------------------ */
  /* contexto para o Side Panel                                          */
  /* ------------------------------------------------------------------ */

  function publishContext() {
    if (state.dead) return;
    try {
      chrome.runtime
        .sendMessage({
          type: "RADAR_CONTEXT_UPDATE",
          context: {
            url: location.href,
            referenceId: S.currentReference(),
            title: S.pageTitle() || null,
            visiblePrice: S.pagePrice(),
            updatedAt: new Date().toISOString(),
          },
        })
        .catch(() => {});
    } catch {
      state.dead = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* observer (sem loop) e boot                                          */
  /* ------------------------------------------------------------------ */

  function isRelevantNode(node, countOwn) {
    if (node.nodeType !== 1) return false;
    if (!countOwn && node.hasAttribute(OWN)) return false;
    const tag = node.tagName;
    return tag !== "SCRIPT" && tag !== "STYLE" && tag !== "LINK" && tag !== "NOSCRIPT";
  }

  function isRelevantMutation(record) {
    // Nós NOSSOS adicionados são ignorados (evita o ciclo mutação → chamada → mutação).
    // Nós NOSSOS removidos contam: significa que o ML apagou a nossa UI e precisamos reanexá-la.
    return (
      [...record.addedNodes].some((node) => isRelevantNode(node, false)) ||
      [...record.removedNodes].some((node) => isRelevantNode(node, true))
    );
  }

  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void enrichSearch(), delay);
  }

  function resetForNavigation() {
    state.lastUrl = location.href;
    state.panel?.host.remove();
    state.panel = null;
    state.pdp?.host.remove();
    state.pdp = null;
    state.lastKey = "";
    state.status = "idle";
    state.items = [];
    state.matches = [];
    state.economics.clear();
    state.reordered = false;
    publishContext();
  }

  const observer = new MutationObserver((records) => {
    if (state.applying || state.dead) return;

    if (location.href !== state.lastUrl) {
      resetForNavigation();
      schedule();
      return;
    }

    if (records.some(isRelevantMutation)) schedule();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  publishContext();
  mountLauncher();
  schedule(300);
  setTimeout(runHealthCheck, 4500);
})();
