/**
 * Mercado Radar — content script (v0.5)
 *
 * Como os números aparecem para QUALQUER anúncio (não só os seus):
 *  - A extensão lê apenas o que a página aberta por você mostra (preço, faixa
 *    de vendidos, avaliações, nota, frete, Full, "mais vendido").
 *  - Envia essa leitura ao seu Radar (/api/extension/observations), que guarda
 *    o histórico e devolve vendas/dia, faturamento/dia e visitas/dia com
 *    intervalo, método e grau de confiança. Nenhuma navegação automática,
 *    nenhuma chamada a páginas que você não abriu.
 *
 * Mantido da v0.4: Shadow DOM, observer sem loop, nenhum dado em innerHTML,
 * leitura do DOM isolada em selectors.js.
 */
(() => {
  "use strict";

  if (globalThis.__mercadoRadarContent) return;
  globalThis.__mercadoRadarContent = true;

  // Páginas de verificação do Mercado Livre (captcha/login) e o site de desenvolvedores: nada aqui.
  if (/^\/(captcha|jms|gz)\b/.test(location.pathname)) return;
  if (location.hostname.startsWith("developers.")) return;

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
    insights: new Map(), // id → insight do Radar
    observed: new Map(), // id → leitura da página
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

  function num(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    if (n >= 1000) return Math.round(n).toLocaleString("pt-BR");
    if (n >= 100) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
  }

  function moneyRange(range) {
    if (!range || range.low == null || range.high == null) return "";
    if (Math.abs(range.high - range.low) < 1e-9) return "";
    const { low, high } = range;
    const short = (n, d) => n.toFixed(d).replace(".", ",").replace(/,0$/, "");
    if (high >= 1e6) return "R$ " + short(low / 1e6, 1) + "–" + short(high / 1e6, 1) + " mi";
    if (high >= 1e3 && low >= 1e3) return "R$ " + short(low / 1e3, 1) + "–" + short(high / 1e3, 1) + " mil";
    if (high >= 1e3) return "R$ " + Math.round(low) + "–" + short(high / 1e3, 1) + " mil";
    return "R$ " + Math.round(low) + "–" + Math.round(high);
  }

  function rangeText(range, formatter) {
    if (!range || range.low == null || range.high == null) return "";
    if (Math.abs(range.high - range.low) < 1e-9) return "";
    return formatter(range.low) + "–" + formatter(range.high);
  }

  const METHOD = {
    OFICIAL: { label: "Oficial", tone: "official", hint: "Pedidos e visitas reais da sua conta." },
    HISTORICO: { label: "Histórico", tone: "history", hint: "Medido pela diferença entre leituras do Radar." },
    VIDA: { label: "Estimativa", tone: "estimate", hint: "Vendidos acumulados ÷ idade do anúncio." },
    PAGINA: { label: "Página", tone: "page", hint: "Só o acumulado que a página mostra." },
  };

  const CONFIDENCE = ["Sem medição", "Confiança baixa", "Confiança média", "Confiança alta"];

  function signal(level) {
    const el = h("span", { class: "signal", "data-level": String(level || 0), title: CONFIDENCE[level || 0] });
    el.append(h("i"), h("i"), h("i"));
    return el;
  }

  function methodBadge(estimate) {
    const m = METHOD[estimate?.method] || METHOD.PAGINA;
    return h(
      "span",
      { class: "src src--" + m.tone, title: m.hint + " " + CONFIDENCE[estimate?.confidence || 0] + "." },
      signal(estimate?.confidence || 0),
      m.label,
    );
  }

  function basisText(estimate) {
    return (estimate?.basis || []).join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* faixa sob cada card da busca                                        */
  /* ------------------------------------------------------------------ */

  function readout(label, value, range, tone) {
    return h(
      "div",
      { class: "ro" },
      h("small", { text: label }),
      h("b", { class: tone || "", text: value }),
      range ? h("span", { class: "ro__range", text: range }) : null,
    );
  }

  function renderStrip(root, insight, observed, econ) {
    const e = insight?.estimate;
    const sales = e?.salesPerDay;
    const revenue = e?.revenuePerDay;
    const visits = e?.visitsPerDay;
    const children = [];

    children.push(
      h(
        "div",
        { class: "strip__head" },
        h("span", { class: "brand" }, markIcon(), "Radar", sales?.value != null ? h("span", { class: "brand__sub", text: "por dia" }) : null),
        e ? methodBadge(e) : h("span", { class: "src src--page", text: "Lendo…" }),
      ),
    );

    if (e && sales?.value != null) {
      children.push(
        h(
          "div",
          { class: "strip__grid", title: basisText(e) },
          readout("Vendas", num(sales.value), rangeText(sales, (v) => num(v))),
          readout("Faturamento", moneyCompact(revenue?.value), moneyRange(revenue)),
          readout("Visitas", num(visits?.value, 0), rangeText(visits, (v) => num(v, 0))),
        ),
      );
    } else {
      const soldLower = observed?.soldLower ?? e?.sold?.lower ?? null;
      const price = observed?.price ?? insight?.price ?? null;
      children.push(
        h(
          "div",
          { class: "strip__grid", title: e ? basisText(e) : "" },
          readout("Vendidos", soldLower == null ? "—" : num(soldLower, 0) + "+"),
          readout("Receita", soldLower != null && price ? moneyCompact(soldLower * price) + "+" : "—"),
          readout("Avaliações", observed?.reviews == null ? "—" : num(observed.reviews, 0)),
        ),
      );
    }

    const foot = [];
    if (insight) {
      foot.push(h("span", { class: "chip chip--" + scoreTone(insight.score), text: "Score " + insight.score }));
      if (insight.demand) foot.push(h("span", { class: "muted", text: "Demanda " + demandText(insight.demand).toLowerCase() }));
    }
    if (econ) {
      const good = Number(econ.marginPercent) >= 15;
      foot.push(
        h("span", {
          class: "chip chip--" + (good ? "ok" : "risk"),
          text: "Minha margem " + pct(econ.marginPercent),
        }),
      );
    }
    if (foot.length) children.push(h("div", { class: "strip__foot" }, ...foot));

    root.replaceChildren(h("div", { class: "strip" }, ...children));
  }

  function mountStrip(card, host) {
    const anchor = S.cardStripAnchor(card);
    if (anchor) anchor.insertAdjacentElement("afterend", host);
    else card.appendChild(host);
  }

  function ensureStrip(card, signature, render) {
    let record = state.strips.get(card);

    if (!record) {
      const made = makeHost("strip");
      record = { host: made.host, root: made.root, mode: "inline", signature: "" };
      state.strips.set(card, record);
    }

    if (!record.host.isConnected) mountStrip(card, record.host);

    if (record.signature !== signature) {
      render(record.root);
      record.signature = signature;
    }
  }

  function decorateCard(card, observed) {
    const insight = observed ? state.insights.get(observed.id) || null : null;
    const econ = observed ? state.economics.get(observed.id) || null : null;
    const e = insight?.estimate;

    card.dataset.radarItemId = observed?.id || "";
    card.dataset.radarScore = String(insight?.score ?? 0);
    card.dataset.radarDemand = insight?.demand || "";
    card.dataset.radarSales = String(e?.salesPerDay?.value ?? 0);
    card.dataset.radarRevenue = String(e?.revenuePerDay?.value ?? 0);
    card.dataset.radarVisits = String(e?.visitsPerDay?.value ?? 0);
    card.dataset.radarConfidence = String(e?.confidence ?? 0);
    card.dataset.radarSold = String(observed?.soldLower ?? 0);
    card.dataset.radarFreeShipping = observed?.freeShipping ? "1" : "0";
    card.dataset.radarFull = observed?.fulfillment ? "1" : "0";
    card.dataset.radarMyMargin = String(econ?.marginPercent ?? -999);
    card.dataset.radarMyRoi = String(econ?.roiPercent ?? -999);

    if (!observed) return;
    const signature = [observed.id, state.dataVersion, insight ? 1 : 0, econ ? 1 : 0].join("|");
    ensureStrip(card, signature, (root) => renderStrip(root, insight, observed, econ));
  }

  /* idempotente: pode rodar quantas vezes quiser sem chamar a API */
  function applyCards(cards) {
    cards.forEach((card, index) => {
      const observed = S.cardObservation(card, index);
      if (observed) state.observed.set(observed.id, observed);
      decorateCard(card, observed);
    });
    applyFilters();
  }

  /* ------------------------------------------------------------------ */
  /* painel de filtros                                                   */
  /* ------------------------------------------------------------------ */

  const FILTERS = {
    sort: ["Ordenar", [["original", "Ordem do Mercado Livre"], ["revenue", "Maior faturamento/dia"], ["sales", "Mais vendas/dia"], ["visits", "Mais visitas/dia"], ["score", "Melhor score"], ["sold", "Mais vendidos (total)"], ["myMargin", "Maior margem para mim"], ["myRoi", "Maior ROI para mim"]]],
    sales: ["Vendas/dia", [["0", "Qualquer"], ["0.5", "0,5+"], ["1", "1+"], ["3", "3+"], ["10", "10+"]]],
    revenue: ["Faturamento/dia", [["0", "Qualquer"], ["100", "R$ 100+"], ["500", "R$ 500+"], ["2000", "R$ 2 mil+"], ["10000", "R$ 10 mil+"]]],
    confidence: ["Confiança da medição", [["0", "Qualquer"], ["1", "Com estimativa"], ["2", "Média ou alta"]]],
    score: ["Score mínimo", [["0", "Qualquer"], ["50", "50+"], ["65", "65+"], ["80", "80+"]]],
    demand: ["Demanda", [["", "Qualquer"], ["EXCELENTE", "Excelente"], ["ALTA", "Alta"], ["MEDIA", "Média"], ["BAIXA", "Baixa"]]],
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
    const mineStatus = h("small", { text: "Usa o custo cadastrado no seu produto mais parecido." });
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
        section("Desempenho", true, filterSelect("sort"), filterSelect("revenue"), filterSelect("sales"), filterSelect("confidence")),
        section("Oportunidade", false, filterSelect("score"), filterSelect("demand")),
        section(
          "Logística",
          false,
          h("label", { class: "check" }, h("input", { type: "checkbox", "data-f": "freeShipping" }), "Só frete grátis"),
          h("label", { class: "check" }, h("input", { type: "checkbox", "data-f": "full" }), "Só Full"),
        ),
        section(
          "Para minha operação",
          false,
          h("div", { class: "mine-box" }, mineButton, mineStatus),
          filterSelect("myMargin", true),
          filterSelect("myRoi", true),
        ),
        h("p", {
          class: "panel__legend",
          text: "Oficial: dados da sua conta · Histórico: medido entre leituras · Estimativa: acumulado ÷ idade · Página: só o que o anúncio mostra.",
        }),
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
    root.querySelectorAll("input[type='checkbox']").forEach((box) => {
      box.checked = false;
    });
    applyFilters();
  }

  function applyFilters() {
    const root = state.panel?.root;
    if (!root) return;

    const control = (name) => root.querySelector(`[data-f="${name}"]`);
    const value = (name, fallback) => Number(control(name)?.value ?? fallback);

    const min = {
      sales: value("sales", 0),
      revenue: value("revenue", 0),
      confidence: value("confidence", 0),
      score: value("score", 0),
      myMargin: value("myMargin", -999),
      myRoi: value("myRoi", -999),
    };
    const demand = control("demand")?.value || "";
    const freeShipping = Boolean(control("freeShipping")?.checked);
    const full = Boolean(control("full")?.checked);
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
          Number(d.radarSales || 0) >= min.sales &&
          Number(d.radarRevenue || 0) >= min.revenue &&
          Number(d.radarConfidence || 0) >= min.confidence &&
          Number(d.radarScore || 0) >= min.score &&
          (!demand || d.radarDemand === demand) &&
          (!freeShipping || d.radarFreeShipping === "1") &&
          (!full || d.radarFull === "1") &&
          Number(d.radarMyMargin ?? -999) >= min.myMargin &&
          Number(d.radarMyRoi ?? -999) >= min.myRoi;

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
        const keyBySort = {
          revenue: "radarRevenue",
          sales: "radarSales",
          visits: "radarVisits",
          score: "radarScore",
          sold: "radarSold",
          myMargin: "radarMyMargin",
          myRoi: "radarMyRoi",
        };

        const sorted = [...cards].sort((a, b) => {
          const key = keyBySort[sort];
          if (!key) return read(a, "radarOriginalIndex", 0) - read(b, "radarOriginalIndex", 0);
          return read(b, key, -999) - read(a, key, -999);
        });

        for (const card of sorted) parent.appendChild(card);
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
    const items = [...state.observed.values()]
      .filter((item) => item.price > 0)
      .slice(0, 12)
      .map((item) => ({ id: item.id, price: item.price }));

    if (!query || !items.length) return;

    panel.mineButton.disabled = true;
    panel.mineButton.textContent = "Calculando…";
    panel.mineStatus.textContent = "Procurando seu produto e custo no Radar…";

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
      panel.mineStatus.textContent = response?.body?.error || "Não foi possível calcular sua margem.";
      retry("Calcular minha margem");
      return;
    }

    if (response.body?.needsCost) {
      panel.mineStatus.textContent = response.body.message || "Encontrei seu produto, mas falta cadastrar o custo.";
      retry("Tentar de novo");
      return;
    }

    if (!Array.isArray(response.body?.items) || !response.body.items.length) {
      panel.mineStatus.textContent = response.body?.message || "Nenhum produto seu parecido com esta busca.";
      retry("Calcular minha margem");
      return;
    }

    for (const economics of response.body.items) state.economics.set(economics.id, economics);
    state.dataVersion += 1;

    panel.root.querySelectorAll("[data-f='myMargin'], [data-f='myRoi']").forEach((el) => {
      el.disabled = false;
    });

    const matched = response.body.matchedProduct;
    panel.mineStatus.textContent = matched
      ? "Usando o custo de " + matched.title + " (" + matched.similarityPercent + "% parecido)"
      : "Margem carregada.";
    panel.mineButton.textContent = "Margem carregada";

    applyCards(S.findCards());
  }

  /* ------------------------------------------------------------------ */
  /* busca: leitura da página → Radar                                    */
  /* ------------------------------------------------------------------ */

  function forceRefresh() {
    state.lastKey = "";
    state.status = "idle";
    schedule(50);
  }

  async function enrichSearch() {
    if (state.running || state.dead) return;

    const cards = S.findCards();
    const query = S.extractQuery();

    // Página de anúncio (mesmo com carrossel de relacionados) nunca é busca.
    if (S.isProductPage() || !query || cards.length < 2) {
      await enrichProduct();
      return;
    }

    const observed = cards
      .map((card, index) => S.cardObservation(card, index))
      .filter(Boolean)
      .slice(0, 60);
    if (!observed.length) return;

    const key = (query || location.pathname) + "|" + observed.map((item) => item.id).join(",");

    if (key === state.lastKey) {
      // Mesmo conjunto de anúncios: nunca chama a API de novo; só remonta a UI.
      if (cards.length >= 3) mountPanel();
      applyCards(cards);
      return;
    }

    state.running = true;
    state.lastKey = key;
    state.status = "loading";
    state.economics.clear();
    for (const item of observed) state.observed.set(item.id, item);
    publishContext();

    try {
      if (cards.length >= 3) mountPanel();
      setNotice("loading", "Medindo os anúncios desta página…");
      applyCards(cards); // mostra os dados da página enquanto o Radar responde

      const response = await send("/api/extension/observations", "POST", {
        page: "search",
        query: query || null,
        items: observed,
      });

      if (response.contextLost) return;

      if (response.status === 401) {
        state.status = "auth";
        setNotice(
          "auth",
          "Entre no Mercado Radar para ver vendas, faturamento e visitas por dia.",
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
        setNotice("error", response.body?.error || "Não foi possível medir esta busca.", "Tentar de novo", forceRefresh);
        return;
      }

      state.status = "ok";
      for (const insight of response.body.items) state.insights.set(insight.id, insight);
      state.dataVersion += 1;
      setNotice("ok");
      applyCards(S.findCards());
    } finally {
      state.running = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* anúncio: widget                                                     */
  /* ------------------------------------------------------------------ */

  function createPdp(observation) {
    const { host, root } = makeHost("widget");
    const body = h("div", { class: "widget__body" });
    const chip = h("span", { class: "chip", hidden: true });
    const chevron = h("span", { class: "muted", text: "▾" });

    const head = h(
      "div",
      { class: "widget__head", role: "button", tabindex: "0", "aria-expanded": "true" },
      h("span", { class: "brand" }, markIcon(), "Mercado Radar"),
      h("span", { class: "widget__head-right" }, chip, chevron),
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

    return {
      ref: observation.id,
      observation,
      host,
      root,
      wrap,
      body,
      chip,
      insight: null,
      apiItem: null,
      catalog: null,
      calc: null,
      calcError: null,
      cost: null,
      floating: false,
      slots: {},
    };
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

  function pdpMessage(target, tone, message, actionLabel, action) {
    target.replaceChildren(
      h(
        "div",
        { class: "notice notice--inline" + (tone === "error" ? " notice--risk" : tone === "limit" ? " notice--warn" : "") },
        h("div", { text: message }),
        actionLabel ? h("button", { class: "btn btn--block", type: "button", text: actionLabel, onClick: action }) : null,
      ),
    );
  }

  function bigReadout(label, value, range, note) {
    return h(
      "div",
      { class: "big" },
      h("small", { text: label }),
      h("b", { text: value }),
      h("span", { class: "big__range", text: range || note || "" }),
    );
  }

  function renderPerformance(pdp) {
    const slot = pdp.slots.performance;
    const insight = pdp.insight;
    const obs = pdp.observation;
    if (!slot) return;

    if (!insight) {
      slot.replaceChildren(h("div", { class: "skeleton" }), h("div", { class: "skeleton", style: "width:70%" }));
      return;
    }

    const e = insight.estimate;
    pdp.chip.hidden = false;
    pdp.chip.className = "chip chip--" + scoreTone(insight.score);
    pdp.chip.textContent = "Score " + insight.score;

    const hasRate = e.salesPerDay?.value != null;
    const readouts = hasRate
      ? [
          bigReadout("Vendas/dia", num(e.salesPerDay.value), rangeText(e.salesPerDay, (v) => num(v))),
          bigReadout("Faturamento/dia", moneyCompact(e.revenuePerDay.value), moneyRange(e.revenuePerDay)),
          bigReadout("Visitas/dia", num(e.visitsPerDay.value, 0), rangeText(e.visitsPerDay, (v) => num(v, 0))),
        ]
      : [
          bigReadout("Vendidos", e.sold?.lower == null ? "—" : num(e.sold.lower, 0) + "+", "", "total do anúncio"),
          bigReadout(
            "Receita total",
            e.sold?.lower != null && insight.price ? moneyCompact(e.sold.lower * insight.price) + "+" : "—",
            "",
            "acumulado × preço",
          ),
          bigReadout("Avaliações", obs.reviews == null ? "—" : num(obs.reviews, 0), "", obs.rating ? "nota " + num(obs.rating) : ""),
        ];

    const facts = [];
    if (hasRate) {
      facts.push(["Vendidos (total)", e.sold?.lower == null ? "—" : e.sold.exact ? num(e.sold.lower, 0) : num(e.sold.lower, 0) + "–" + num(e.sold.upper, 0)]);
      facts.push(["Vendas/mês", num((e.salesPerDay.value || 0) * 30, 0)]);
    }
    facts.push(["Conversão usada", pct((e.conversion?.value || 0) * 100)]);
    if (e.ageDays?.value != null) facts.push(["Idade do anúncio", num(e.ageDays.value, 0) + " dias" + (e.ageDays.source === "ID_ESTIMADO" ? " (est.)" : "")]);
    facts.push(["Leituras do Radar", String(e.observations || 1)]);
    if (insight.bestSellerLabel) facts.push(["Destaque", insight.bestSellerLabel]);

    const how = h(
      "details",
      { class: "how" },
      h("summary", { text: "Como o Radar calculou" }),
      h("ul", {}, ...(e.basis || []).map((line) => h("li", { text: line }))),
    );

    slot.replaceChildren(
      h(
        "div",
        { class: "perf__head" },
        h("span", { class: "block__title", text: "Desempenho do anúncio" }),
        methodBadge(e),
      ),
      h("div", { class: "bigs" }, ...readouts),
      h(
        "div",
        { class: "facts" },
        ...facts.map(([label, value]) => h("div", { class: "fact" }, h("span", { text: label }), h("b", { text: value }))),
      ),
      how,
    );
  }

  function payoutBlock(pdp) {
    const slot = pdp.slots.payout;
    if (!slot) return;

    if (pdp.calcError) {
      slot.replaceChildren(
        h("div", { class: "block__title", text: "Quanto você recebe" }),
        h("div", { class: "muted", text: pdp.calcError }),
      );
      return;
    }

    if (!pdp.calc) {
      slot.replaceChildren(h("div", { class: "block__title", text: "Quanto você recebe" }), h("div", { class: "skeleton" }));
      return;
    }

    const { fees, result, shippingKnown } = pdp.calc;
    const hasCost = pdp.cost != null;
    const line = (label, value, className) =>
      h("div", { class: "line" + (className ? " " + className : "") }, h("span", { text: label }), h("b", { text: value }));

    const lines = [
      line("Preço de venda", brl(result.salePrice)),
      line("Comissão (" + pct(fees.commissionPercent) + ")", "− " + brl(fees.commissionAmount), "neg"),
    ];
    if (Number(fees.fixedFee) > 0) lines.push(line("Tarifa fixa", "− " + brl(fees.fixedFee), "neg"));
    lines.push(
      shippingKnown
        ? line("Frete", "− " + brl(fees.shippingCost), "neg")
        : line("Frete", "não incluído", "dim"),
    );
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
        costButton.textContent = "Calculando…";
        pdp.cost = value;
        await loadPdpCalculation(pdp);
      },
    });

    slot.replaceChildren(
      h("div", { class: "block__title", text: "Quanto você recebe vendendo a este preço" }),
      h("div", { class: "payout" }, ...lines),
      h("div", { class: "cost-row" }, costInput, costButton),
      hasCost
        ? h("div", { class: "muted mt", text: "Margem " + pct(result.marginPercent) + " · ROI " + pct(result.roiPercent) + " · preço mínimo saudável " + brl(result.minimumSuggestedPrice) })
        : h("div", { class: "muted mt", text: "Informe seu custo para ver lucro, margem e ROI." }),
      shippingKnown
        ? null
        : h("div", { class: "muted mt", text: "Anúncio de outro vendedor: o frete depende do peso e da sua reputação; some o seu frete médio ao custo." }),
    );
  }

  function renderBuyBox(pdp) {
    const slot = pdp.slots.buybox;
    const winner = pdp.catalog?.buyBoxWinner;
    if (!slot) return;
    if (!winner?.price) {
      slot.replaceChildren();
      return;
    }
    const price = pdp.observation.price;
    const delta = price ? ((price - winner.price) / winner.price) * 100 : null;
    slot.replaceChildren(
      h("div", { class: "block__title", text: "Buy Box do catálogo" }),
      h("div", { class: "rows" }, h("div", { class: "row" }, h("span", { text: "Vencedor" }), h("b", { text: brl(winner.price) }))),
      h("div", {
        class: "muted",
        text:
          (winner.logisticType ? logisticText(winner.logisticType) + " · " : "") +
          (winner.freeShipping ? "frete grátis" : "frete pago") +
          (delta == null ? "" : " · este anúncio " + (delta >= 0 ? "+" : "") + pct(delta)),
      }),
    );
  }

  function renderPdp(pdp) {
    pdp.slots = {
      performance: h("div", { class: "block block--first" }),
      payout: h("div", { class: "block" }),
      buybox: h("div", { class: "block" }),
      market: h("div", { class: "block" }),
    };

    pdp.body.replaceChildren(
      pdp.slots.performance,
      pdp.slots.payout,
      pdp.slots.buybox,
      pdp.slots.market,
      h(
        "div",
        { class: "block actions" },
        h("button", {
          class: "btn btn--ghost btn--block",
          type: "button",
          text: "Monitorar este anúncio",
          onClick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = "Salvando…";
            const response = await send("/api/extension/watchlist", "POST", {
              itemId: pdp.observation.id,
              referenceId: pdp.ref,
            });
            button.disabled = false;
            button.textContent = response?.ok
              ? "Monitorando"
              : response?.body?.error || "Não foi possível monitorar. Tente de novo.";
          },
        }),
      ),
    );

    renderPerformance(pdp);
    payoutBlock(pdp);
    renderBuyBox(pdp);
    renderMarketButton(pdp);
  }

  function renderMarketButton(pdp) {
    pdp.slots.market.replaceChildren(
      h("button", {
        class: "btn btn--ghost btn--block",
        type: "button",
        text: "Ver faixa de preço do mercado",
        onClick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = "Carregando…";
          await loadPdpMarket(pdp);
        },
      }),
    );
  }

  async function loadPdpMarket(pdp) {
    const obs = pdp.observation;
    const params = new URLSearchParams({
      title: obs.title,
      itemId: obs.id,
      currentPrice: String(obs.price || 0),
    });
    const categoryId = pdp.apiItem?.categoryId || obs.categoryId;
    if (categoryId) params.set("categoryId", categoryId);

    const response = await send("/api/extension/market?" + params.toString());
    const slot = pdp.slots.market;

    if (!response?.ok || !response.body?.market) {
      slot.replaceChildren(h("div", { class: "muted", text: response?.body?.error || "Sem dados de mercado para este anúncio." }));
      return;
    }

    const market = response.body.market;
    const competitors = Array.isArray(response.body.competitors) ? response.body.competitors : [];

    slot.replaceChildren(
      h("div", { class: "block__title", text: "Faixa de preço do mercado" }),
      h(
        "div",
        { class: "facts facts--3" },
        h("div", { class: "fact" }, h("span", { text: "25% mais baratos" }), h("b", { text: brl(market.p25, 0) })),
        h("div", { class: "fact" }, h("span", { text: "Mediana" }), h("b", { text: brl(market.median, 0) })),
        h("div", { class: "fact" }, h("span", { text: "25% mais caros" }), h("b", { text: brl(market.p75, 0) })),
      ),
      h("div", {
        class: "muted mt",
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
            { class: "rows mt" },
            ...competitors.slice(0, 4).map((c) => h("div", { class: "row" }, h("span", { text: c.title }), h("b", { text: brl(c.price) }))),
          )
        : null,
    );
  }

  async function loadPdpCalculation(pdp) {
    const settings = await getSettings();
    const obs = pdp.observation;
    const response = await send("/api/extension/profitability", "POST", {
      itemId: obs.id,
      salePrice: obs.price || undefined,
      supplierPrice: pdp.cost ?? 0,
      discountPercent: 0,
      kitQuantity: 1,
      taxPercent: settings.taxPercent,
      operatingCost: pdp.cost == null ? 0 : settings.operatingCost,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
      title: obs.title || undefined,
      categoryId: obs.categoryId || undefined,
      listingType: obs.listingTypeHint || undefined,
      freeShipping: Boolean(obs.freeShipping),
    });

    if (!response?.ok || !response.body?.result) {
      pdp.calc = null;
      pdp.calcError = response?.body?.error || "Não foi possível calcular as tarifas deste anúncio.";
    } else {
      pdp.calc = response.body;
      pdp.calcError = null;
    }
    payoutBlock(pdp);
  }

  async function loadPdp(pdp) {
    renderPdp(pdp);

    // 1) desempenho: funciona para qualquer anúncio (leitura da página + histórico)
    const response = await send("/api/extension/observations", "POST", {
      page: "product",
      query: null,
      items: [pdp.observation],
    });
    if (response.contextLost) return;

    if (response.status === 401) {
      pdpMessage(pdp.body, "info", "Entre no Mercado Radar para ver vendas, faturamento, visitas e sua margem neste anúncio.", "Entrar no Mercado Radar", async () => {
        const result = await login();
        if (result?.authenticated) void loadPdp(pdp);
        else pdpMessage(pdp.body, "error", result?.error || "Não foi possível entrar.", "Tentar de novo", () => void loadPdp(pdp));
      });
      return;
    }

    if (response.status === 429) {
      pdpMessage(pdp.body, "limit", response.body?.error || "Limite diário da extensão atingido.");
      return;
    }

    if (response.ok && Array.isArray(response.body?.items) && response.body.items[0]) {
      pdp.insight = response.body.items[0];
      renderPerformance(pdp);
    } else {
      pdpMessage(pdp.slots.performance, "error", response.body?.error || "Não foi possível medir este anúncio.", "Tentar de novo", () => void loadPdp(pdp));
    }

    // 2) detalhes oficiais (só existem para anúncios liberados pela API, ex.: os seus)
    const params = new URLSearchParams({ id: pdp.observation.id });
    if (pdp.observation.price) params.set("visiblePrice", String(pdp.observation.price));
    const item = await send("/api/extension/item?" + params.toString());
    if (item?.ok && item.body?.item) {
      pdp.apiItem = item.body.item;
      pdp.catalog = item.body.catalog || null;
      renderBuyBox(pdp);
    }

    // 3) custo cadastrado no Radar (produto seu mais parecido), se existir
    const settings = await getSettings();
    const mine = await send("/api/extension/search-profitability", "POST", {
      query: pdp.observation.title,
      items: [{ id: pdp.observation.id, price: pdp.observation.price }],
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
    if (!S.isProductPage()) return;

    const observation = S.pageObservation();
    if (!observation) return;

    if (state.pdp && state.pdp.ref === observation.id) {
      mountPdp(); // idempotente: só recoloca se o ML removeu o widget
      return;
    }

    if (state.pdpBusy) return;
    state.pdpBusy = true;

    try {
      state.pdp?.host.remove();
      state.pdp = createPdp(observation);
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
    state.insights.clear();
    state.observed.clear();
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
