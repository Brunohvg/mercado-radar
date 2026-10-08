/**
 * Mercado Radar — content script (v0.6)
 *
 * Como os números aparecem para QUALQUER anúncio (não só os seus):
 *  - A extensão lê apenas o que a página aberta por você mostra (preço, faixa
 *    de vendidos, avaliações, nota, frete, Full, "mais vendido").
 *  - Envia essa leitura ao seu Radar (/api/extension/observations), que guarda
 *    o histórico e devolve vendas/dia, faturamento/dia e visitas/dia com
 *    intervalo, método e grau de confiança. Nenhuma navegação automática,
 *    nenhuma chamada a páginas que você não abriu.
 *  - Sem login (ou com erro/limite) cada card mostra o que a própria página
 *    dá: demanda aproximada e faturamento acumulado (piso de vendidos × preço).
 *    Nunca fica em "Lendo…" depois que a resposta chega ou estoura o tempo.
 *
 * Chamadas automáticas: busca = 1 POST por conjunto de anúncios; anúncio =
 * observations + tarifas (2). O resto (custo, mercado, buy box, monitorar,
 * comparar) só roda quando a pessoa pede.
 *
 * Mantido: Shadow DOM, observer sem loop, nenhum dado em innerHTML, leitura do
 * DOM isolada em selectors.js.
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
  const REQUEST_TIMEOUT_MS = 20000;
  const DAY_MS = 86_400_000;

  const state = {
    lastUrl: location.href,
    timer: null,
    running: false,
    applying: false,
    reordered: false,
    status: "idle", // idle | loading | ok | auth | limit | error
    statusMessage: "",
    lastKey: "",
    insights: new Map(), // id → insight do Radar
    observed: new Map(), // id → leitura da página
    economics: new Map(),
    dataVersion: 0,
    strips: new WeakMap(),
    tags: new WeakMap(),
    panel: null,
    filters: { catalog: false, noCatalog: false, full: false, noFull: false, free: false, data: false },
    sort: "original",
    pdp: null,
    pdpBusy: false,
    launcher: null,
    auth: null, // { authenticated, nickname }
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

  function svgIcon(paths, { width = 1.8, fill = false } = {}) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", String(width));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      if (fill) path.setAttribute("fill", "currentColor");
      svg.append(path);
    }
    return svg;
  }

  const ICONS = {
    trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
    info: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "M12 11v5", "M12 8h.01"],
    calc: ["M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 7h8", "M8 12h.01", "M12 12h.01", "M16 12h.01", "M8 16h.01", "M12 16h.01", "M16 16h.01"],
    eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z"],
    compare: ["M8 8h12v12H8z", "M4 16V4h12"],
    chart: ["M3 3v18h18", "M7 15l4-4 3 3 5-6"],
    barcode: ["M3 6v12", "M7 6v12", "M10 6v12", "M14 6v12", "M17 6v12", "M21 6v12"],
    sliders: ["M4 7h9", "M17 7h3", "M15 5v4", "M4 17h3", "M11 17h9", "M9 15v4"],
    panel: ["M3 4h18v16H3z", "M3 9h18", "M9 9v11"],
    login: ["M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4", "M10 17l5-5-5-5", "M15 12H3"],
    logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
    chevron: ["M6 9l6 6 6-6"],
    lock: ["M6 11h12v10H6z", "M8 11V7a4 4 0 0 1 8 0v4"],
    external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
    pin: ["M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z", "M12 8a2 2 0 1 0 0 4a2 2 0 0 0 0-4z"],
    tag: ["M3 12V4h8l10 10-8 8L3 12z", "M7.5 7.5h.01"],
    box: ["M3 7l9-4 9 4v10l-9 4-9-4V7z", "M3 7l9 4 9-4", "M12 11v10"],
    user: ["M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
    copy: ["M9 9h11v11H9z", "M5 15V5h10"],
    check: ["M5 12l5 5 9-10"],
  };

  function icon(name, options) {
    return svgIcon(ICONS[name] || [], options);
  }

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
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  /** Valor compacto sem cortar: R$ 17,16 · R$ 345 · R$ 1,5 mil · R$ 79 mil · R$ 1,2 mi */
  function moneyCompact(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const v = Number(value);
    const f = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });
    if (v >= 1e6) return "R$ " + f(v / 1e6, 1) + " mi";
    if (v >= 1e4) return "R$ " + f(v / 1e3, 0) + " mil";
    if (v >= 1e3) return "R$ " + f(v / 1e3, 1) + " mil";
    if (v >= 100) return "R$ " + Math.round(v).toLocaleString("pt-BR");
    return brl(v, 2);
  }

  function pct(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  }

  function num(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    if (n >= 1000) return Math.round(n).toLocaleString("pt-BR");
    if (n >= 100) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
  }

  /** 1000 → "1 mil", 10000 → "10 mil", 1500000 → "1,5 mi" */
  function countCompact(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const f = (v, d) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
    if (n >= 1e6) return f(n / 1e6, 1) + " mi";
    if (n >= 1e3) return f(n / 1e3, n >= 1e4 ? 0 : 1) + " mil";
    return f(n, 0);
  }

  function soldText(lower, plus = true) {
    if (lower == null) return "—";
    return (plus ? "+" : "") + countCompact(lower);
  }

  function rangeText(range, formatter) {
    if (!range || range.low == null || range.high == null) return "";
    if (Math.abs(range.high - range.low) < 1e-9) return "";
    return formatter(range.low) + " a " + formatter(range.high);
  }

  function scoreTone(score) {
    if (score >= 65) return "ok";
    if (score >= 45) return "warn";
    return "risk";
  }

  const DEMAND = {
    EXCELENTE: { label: "Excelente", tone: "excelente" },
    ALTA: { label: "Alta", tone: "alta" },
    MEDIA: { label: "Média", tone: "media" },
    BAIXA: { label: "Baixa", tone: "baixa" },
  };

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

  function formatDate(ms) {
    return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  async function send(path, method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(
        () =>
          resolve({
            ok: false,
            status: 0,
            timeout: true,
            body: { error: "O Radar demorou para responder." },
          }),
        timeoutMs,
      );
    });

    try {
      const call = chrome.runtime.sendMessage({ type: "RADAR_FETCH", path, method, body });
      return await Promise.race([call, timeout]);
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
    } finally {
      clearTimeout(timer);
    }
  }

  async function getSettings() {
    const stored = await chrome.storage.sync.get([
      "radarTaxPercent",
      "radarOperatingCost",
      "radarTargetMarginPercent",
      "radarTargetRoiPercent",
      "radarShippingEstimate",
      "radarApiBase",
    ]);

    return {
      taxPercent: Number(stored.radarTaxPercent || 0),
      operatingCost: Number(stored.radarOperatingCost || 0),
      targetMarginPercent: Number(stored.radarTargetMarginPercent || 20),
      targetRoiPercent: Number(stored.radarTargetRoiPercent || 30),
      shippingEstimate: Number(stored.radarShippingEstimate || 0),
      apiBase: stored.radarApiBase || "https://radar.optarys.com.br",
    };
  }

  async function login() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGIN" });
      if (result?.authenticated) {
        state.auth = { authenticated: true, nickname: result.account?.nickname || null };
      }
      return result;
    } catch {
      return { authenticated: false, error: "Recarregue a página e tente novamente." };
    }
  }

  async function refreshAuth() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "RADAR_AUTH_STATUS" });
      state.auth = {
        authenticated: Boolean(result?.authenticated),
        nickname: result?.account?.nickname || null,
      };
    } catch {
      // mantém o último estado conhecido
    }
    return state.auth;
  }

  async function loginFlow(onFail) {
    const result = await login();
    if (result?.authenticated) {
      forceRefresh();
      if (state.pdp) void loadPdp(state.pdp);
    } else if (onFail) {
      onFail(result?.error || "Não foi possível entrar.");
    }
    return result;
  }

  const METHOD = {
    OFICIAL: { label: "Oficial", tone: "official", hint: "Pedidos e visitas reais da sua conta." },
    HISTORICO: { label: "Histórico", tone: "history", hint: "Medido pela diferença entre leituras do Radar." },
    VIDA: { label: "Estimativa", tone: "estimate", hint: "Vendidos acumulados ÷ idade do anúncio." },
    PAGINA: { label: "Página", tone: "page", hint: "Só o acumulado que a página mostra." },
  };

  const CONFIDENCE = ["Sem medição", "Confiança baixa", "Confiança média", "Confiança alta"];

  function methodBadge(estimate) {
    const m = METHOD[estimate?.method] || METHOD.PAGINA;
    const badge = h("span", { class: "src src--" + m.tone, tabindex: "0" }, m.label);
    attachTip(badge, m.hint + " " + CONFIDENCE[estimate?.confidence || 0] + ".");
    return badge;
  }

  /* ------------------------------------------------------------------ */
  /* balão (um só, fora do card, para nunca ser cortado pelo layout do ML) */
  /* ------------------------------------------------------------------ */

  let tipHost = null;
  let tipEl = null;
  let tipTarget = null;

  function ensureTip() {
    if (tipHost?.isConnected) return;
    const made = makeHost("tip");
    made.host.style.cssText = "all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    tipEl = h("div", { class: "tipbox", role: "tooltip", hidden: true });
    made.root.append(tipEl);
    document.body.appendChild(made.host);
    tipHost = made.host;
  }

  function hideTip() {
    tipTarget = null;
    if (tipEl) tipEl.hidden = true;
  }

  function showTip(target, text) {
    if (!text || !document.body) return;
    ensureTip();
    tipTarget = target;
    tipEl.textContent = text;
    tipEl.hidden = false;
    tipEl.style.left = "0px";
    tipEl.style.top = "0px";

    const rect = target.getBoundingClientRect();
    const box = tipEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
    let top = rect.top - box.height - 8;
    if (top < margin) top = Math.min(rect.bottom + 8, window.innerHeight - box.height - margin);
    tipEl.style.left = Math.round(left) + "px";
    tipEl.style.top = Math.round(top) + "px";
  }

  function attachTip(element, text) {
    const read = () => (typeof text === "function" ? text() : text);
    element.addEventListener("mouseenter", () => showTip(element, read()));
    element.addEventListener("mouseleave", hideTip);
    element.addEventListener("focus", () => showTip(element, read()));
    element.addEventListener("blur", hideTip);
    element.addEventListener("click", (event) => {
      // toque em tela sem hover: alterna
      if (event.pointerType === "touch" || event.detail === 0) {
        tipTarget === element ? hideTip() : showTip(element, read());
      }
    });
    if (!element.hasAttribute("tabindex") && element.tagName !== "BUTTON") element.setAttribute("tabindex", "0");
    element.setAttribute("data-tip", "1");
    return element;
  }

  window.addEventListener("scroll", () => tipTarget && hideTip(), { passive: true, capture: true });

  function infoButton(text, label = "Como é calculado") {
    const button = h("button", { class: "info", type: "button", "aria-label": label }, icon("info"));
    attachTip(button, text);
    return button;
  }

  /* ------------------------------------------------------------------ */
  /* modelo de exibição de um card                                       */
  /* ------------------------------------------------------------------ */

  /** Demanda aproximada só com o que a página mostra (mesmas faixas do servidor). */
  function approxDemand(observed) {
    let level = null;
    if (observed?.soldLower != null) {
      level = observed.soldLower >= 5000 ? 2 : observed.soldLower >= 500 ? 1 : 0;
    } else if (observed?.reviews != null) {
      level = observed.reviews >= 1500 ? 2 : observed.reviews >= 150 ? 1 : 0;
    }
    if (observed?.bestSellerLabel || observed?.bestSellerRank) level = Math.max(level ?? 0, 2);
    return level == null ? null : ["BAIXA", "MEDIA", "ALTA"][level];
  }

  function isEstimated(estimate, field) {
    if (!estimate) return true;
    if (estimate.method === "OFICIAL") {
      return field === "visits" ? estimate.conversion?.source !== "OFICIAL" : false;
    }
    return true;
  }

  function cardModel(observed, insight, extras) {
    const e = insight?.estimate || null;
    const rate = e?.salesPerDay?.value ?? null;
    const price = observed?.price ?? insight?.price ?? null;
    const soldLower = observed?.soldLower ?? e?.sold?.lower ?? null;
    const accumulated = soldLower != null && price ? soldLower * price : null;

    let demandKey = null;
    let demandApprox = true;
    if (insight?.demand && rate != null) {
      demandKey = insight.demand;
      demandApprox = false;
    } else {
      demandKey = approxDemand(observed) || insight?.demand || null;
    }

    let revenue = null;
    if (rate != null && e?.revenuePerDay?.value != null) {
      revenue = {
        kind: "month",
        value: e.revenuePerDay.value * 30,
        perDay: e.revenuePerDay.value,
        approx: isEstimated(e, "revenue"),
      };
    } else if (accumulated != null) {
      revenue = { kind: "accumulated", value: accumulated, soldLower, price };
    }

    const age = e?.ageDays?.value != null ? e.ageDays : null;
    const empty = demandKey == null && revenue == null;
    return {
      id: observed?.id,
      insight,
      estimate: e,
      rate,
      demandKey,
      demandApprox,
      revenue,
      empty,
      age,
      extras,
      hasData: !empty,
      soldLower,
      price,
    };
  }

  /* ------------------------------------------------------------------ */
  /* caixa fixa sob o título de cada card da busca                       */
  /* ------------------------------------------------------------------ */

  function demandPill(model) {
    const d = DEMAND[model.demandKey];
    if (!d) return h("span", { class: "pill pill--none", text: "—" });
    const pill = h("span", { class: "pill pill--" + d.tone + (model.demandApprox ? " pill--approx" : ""), tabindex: "0", text: d.label });
    attachTip(
      pill,
      model.demandApprox
        ? "Demanda aproximada pelo que a página mostra: faixa de vendidos, avaliações e selo de mais vendido. Com login e leituras de outros dias o Radar mede o ritmo real."
        : "Demanda pelo ritmo de vendas por dia. Baixa: menos de 0,7 por dia. Média: 0,7 a 3. Alta: 3 a 10. Excelente: 10 ou mais.",
    );
    return pill;
  }

  function revenueColumn(model) {
    const r = model.revenue;
    if (!r) {
      return h("div", { class: "dcol" }, h("span", { class: "dval dval--none", text: "—" }), h("span", { class: "dlabel", text: "faturamento" }));
    }
    const month = r.kind === "month";
    const value = h(
      "span",
      { class: "dval" + (month ? " dval--up" : ""), tabindex: "0" },
      icon("trend"),
      (month && r.approx ? "~" : "") + moneyCompact(r.value),
    );
    attachTip(
      value,
      month
        ? "Vendas por dia estimadas × preço × 30 dias (cerca de " + (r.approx ? "~" : "") + moneyCompact(r.perDay) + " por dia). É uma estimativa, não um valor medido."
        : "Faturamento acumulado: menor faixa de vendidos que a página mostra (" +
            soldText(r.soldLower) +
            ") × preço de " +
            brl(r.price) +
            ". É o total desde que o anúncio existe, não o de hoje.",
    );
    return h(
      "div",
      { class: "dcol" },
      value,
      h("span", { class: "dlabel", text: month ? "faturamento/mês" : "acumulado" }),
    );
  }

  function hintNode(model, econ) {
    const status = state.status;
    const nodes = [];
    const e = model.estimate;

    if (status === "loading" && !e) {
      nodes.push(h("span", { class: "hint__text hint__text--busy", text: "Medindo ritmo…" }));
    } else if (status === "auth" && !e) {
      nodes.push(
        h("button", {
          class: "hint__link",
          type: "button",
          text: "Entre para ver vendas/dia",
          onClick: () => void loginFlow((msg) => setNotice("error", msg, "Tentar de novo", forceRefresh)),
        }),
      );
    } else if (status === "limit" && !e) {
      nodes.push(h("span", { class: "hint__text hint__text--warn", text: "Limite diário atingido" }));
    } else if (status === "error" && !e) {
      nodes.push(h("button", { class: "hint__link", type: "button", text: "Falhou · tentar de novo", onClick: forceRefresh }));
    } else if (e && model.rate != null) {
      const m = METHOD[e.method] || METHOD.PAGINA;
      nodes.push(
        h("span", { class: "hint__text", text: (isEstimated(e, "sales") ? "~" : "") + num(model.rate) + " vendas/dia · " + m.label }),
      );
    } else if (e) {
      nodes.push(h("span", { class: "hint__text", text: "Sem ritmo ainda · reabra outro dia" }));
    }

    if (econ) {
      const good = Number(econ.marginPercent) >= 15;
      nodes.push(h("span", { class: "chip chip--" + (good ? "ok" : "risk"), text: "Sua margem " + pct(econ.marginPercent) }));
    }
    return nodes;
  }

  function renderStrip(root, model, econ) {
    const rows = [];
    if (model.empty) {
      rows.push(h("div", { class: "dbox__empty", text: "Sem dados disponíveis" }));
    } else {
      rows.push(
        h(
          "div",
          { class: "dbox__row" },
          h("div", { class: "dcol" }, demandPill(model), h("span", { class: "dlabel", text: model.demandApprox ? "demanda aprox." : "demanda" })),
          revenueColumn(model),
        ),
      );
    }
    rows.push(h("div", { class: "dbox__hint" }, ...hintNode(model, econ)));
    root.replaceChildren(h("div", { class: "dbox" + (model.empty ? " dbox--empty" : "") }, ...rows));
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
      record = { host: made.host, root: made.root, signature: "" };
      state.strips.set(card, record);
    }

    if (!record.host.isConnected) mountStrip(card, record.host);

    if (record.signature !== signature) {
      render(record.root);
      record.signature = signature;
    }
  }

  /* selo de tipo + data de criação, sobre a imagem */
  function ensureTags(card, model) {
    const kind = model.extras?.listingKind;
    const age = model.age;
    const signature = [kind || "", age ? age.value + age.source : ""].join("|");
    let record = state.tags.get(card);

    if (!kind && !age) {
      if (record) record.host.remove();
      state.tags.delete(card);
      return;
    }

    if (!record) {
      const made = makeHost("tags");
      made.host.style.cssText = "all:initial;position:absolute;top:8px;left:8px;z-index:3;display:block;pointer-events:none;";
      record = { host: made.host, root: made.root, signature: "" };
      state.tags.set(card, record);
    }

    const media = S.cardMediaAnchor(card);
    if (!media) return;
    if (!record.host.isConnected || record.host.parentElement !== media) {
      if (getComputedStyle(media).position === "static") media.style.position = "relative";
      media.appendChild(record.host);
    }

    if (record.signature === signature) return;
    record.signature = signature;

    const nodes = [];
    if (kind) {
      const badge = h("span", { class: "badge badge--" + kind.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), text: kind });
      badge.title = model.extras.inferred
        ? "Tipo inferido: parcelamento sem juros indica Premium; sem ele, Clássico. O Mercado Livre não mostra o tipo no card."
        : "Anúncio de catálogo";
      nodes.push(badge);
    }
    if (age) {
      const estimated = age.source === "ID_ESTIMADO";
      const created = Date.now() - age.value * DAY_MS;
      const pill = h("span", {
        class: "agepill",
        text: (estimated ? "~" : "") + formatDate(created) + " · " + (estimated ? "~" : "") + Math.round(age.value) + " dias atrás",
      });
      pill.title = estimated
        ? "Data estimada pelo número do anúncio (os números são sequenciais no tempo)."
        : "Data de criação informada pelo Mercado Livre.";
      nodes.push(pill);
    }
    record.root.replaceChildren(h("div", { class: "tags" }, ...nodes));
  }

  function decorateCard(card, observed) {
    const insight = observed ? state.insights.get(observed.id) || null : null;
    const econ = observed ? state.economics.get(observed.id) || null : null;
    const extras = observed ? S.cardExtras(card) : null;
    const model = cardModel(observed, insight, extras);

    card.dataset.radarItemId = observed?.id || "";
    card.dataset.radarCatalog = extras?.isCatalog ? "1" : "0";
    card.dataset.radarFull = observed?.fulfillment ? "1" : "0";
    card.dataset.radarFreeShipping = observed?.freeShipping ? "1" : "0";
    card.dataset.radarHasData = model.hasData ? "1" : "0";
    card.dataset.radarSold = String(observed?.soldLower ?? -1);
    card.dataset.radarPrice = String(observed?.price ?? -1);
    // faturamento ordenável: quem tem ritmo medido vem antes de quem só tem acumulado
    card.dataset.radarRev = String(
      model.revenue ? (model.revenue.kind === "month" ? 1e12 + model.revenue.value : model.revenue.value) : -1,
    );

    if (!observed) return;
    const signature = [observed.id, state.dataVersion, state.status, insight ? 1 : 0, econ ? 1 : 0].join("|");
    ensureStrip(card, signature, (root) => renderStrip(root, model, econ));
    ensureTags(card, model);
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
  /* painel lateral: resumo da amostra, filtros e ordenação              */
  /* ------------------------------------------------------------------ */

  const FILTER_ROWS = [
    ["catalog", "Apenas catálogo", "Anúncios que apontam para uma página de catálogo."],
    ["noCatalog", "Sem catálogo", "Anúncios que não são de catálogo."],
    ["full", "Apenas Full", "Anúncios enviados pelo Full do Mercado Livre."],
    ["noFull", "Sem Full", "Anúncios que não aparecem como Full."],
    ["free", "Frete grátis", "Anúncios com frete grátis no card."],
    ["data", "Só com dados", "Esconde cards sem demanda nem faturamento para mostrar."],
  ];

  const SORT_BUTTONS = [
    ["sold", "+ Vendidos", "Maior faixa de vendidos que a página mostra."],
    ["revenue", "Faturamento", "Maior faturamento mostrado no card."],
    ["low", "Menor R$", "Menor preço primeiro."],
    ["high", "Maior R$", "Maior preço primeiro."],
  ];

  function buildPanel() {
    const { host, root } = makeHost("panel");

    const title = h("span", { class: "panel__count" });
    const notice = h("div", { class: "notice", hidden: true });
    const kpiNodes = {
      catalog: h("b", { text: "0" }),
      full: h("b", { text: "0" }),
      both: h("b", { text: "0" }),
    };
    const sampleText = h("span", { class: "sample__text" });
    const rows = new Map();

    const kpis = h(
      "div",
      { class: "kpis3" },
      h("div", { class: "kpi3" }, kpiNodes.catalog, h("small", { text: "Catálogos" })),
      h("div", { class: "kpi3" }, kpiNodes.full, h("small", { text: "Full" })),
      h("div", { class: "kpi3" }, kpiNodes.both, h("small", { text: "Full + cat." })),
    );

    const marketLink = h("button", {
      class: "link sample__link",
      type: "button",
      onClick: () => void openRadar("/mercado", S.extractQuery()),
    }, "Ver no Radar", icon("external"));

    const filterList = h("div", { class: "frows" });
    for (const [key, label, hint] of FILTER_ROWS) {
      const count = h("span", { class: "frow__count", text: "0" });
      const toggle = h("span", { class: "switch", "aria-hidden": "true" }, h("i"));
      const row = h(
        "button",
        {
          class: "frow",
          type: "button",
          role: "switch",
          "aria-checked": "false",
          "data-filter": key,
          onClick: () => {
            setFilter(key, !state.filters[key]);
          },
        },
        h("span", { class: "frow__label", text: label }),
        count,
        toggle,
      );
      attachTip(row, hint);
      rows.set(key, { row, count });
      filterList.append(row);
    }

    const sortGrid = h("div", { class: "sortgrid" });
    const sortButtons = new Map();
    for (const [key, label, hint] of SORT_BUTTONS) {
      const button = h("button", {
        class: "sortbtn",
        type: "button",
        "aria-pressed": "false",
        "data-sort": key,
        text: label,
        onClick: () => setSort(state.sort === key ? "original" : key),
      });
      attachTip(button, hint);
      sortButtons.set(key, button);
      sortGrid.append(button);
    }

    const foot = h(
      "div",
      { class: "panel__foot" },
      h("span", { class: "panel__shown" }),
      h("button", { class: "link", type: "button", text: "Limpar", onClick: resetFilters }),
    );

    const panel = h(
      "section",
      { class: "panel", "aria-label": "Mercado Radar: resumo e filtros da busca" },
      h("div", { class: "panel__head" }, h("span", { class: "brand" }, markIcon(), "Mercado Radar"), title),
      notice,
      h(
        "div",
        { class: "panel__body" },
        kpis,
        h("div", { class: "sample" }, sampleText, marketLink),
        h("div", { class: "panel__label", text: "Filtros" }),
        filterList,
        h("div", { class: "panel__label", text: "Ordenar" }),
        sortGrid,
        foot,
      ),
    );

    root.append(panel);

    return {
      host,
      root,
      title,
      notice,
      kpiNodes,
      sampleText,
      rows,
      sortButtons,
      shown: foot.querySelector(".panel__shown"),
    };
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
      host.style.setProperty("width", "280px");
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

  function setFilter(key, on) {
    const f = state.filters;
    f[key] = on;
    if (on && key === "catalog") f.noCatalog = false;
    if (on && key === "noCatalog") f.catalog = false;
    if (on && key === "full") f.noFull = false;
    if (on && key === "noFull") f.full = false;
    applyFilters();
  }

  function setSort(key) {
    state.sort = key;
    applyFilters();
  }

  function resetFilters() {
    for (const key of Object.keys(state.filters)) state.filters[key] = false;
    state.sort = "original";
    applyFilters();
  }

  const FILTER_TESTS = {
    catalog: (d) => d.radarCatalog === "1",
    noCatalog: (d) => d.radarCatalog !== "1",
    full: (d) => d.radarFull === "1",
    noFull: (d) => d.radarFull !== "1",
    free: (d) => d.radarFreeShipping === "1",
    data: (d) => d.radarHasData === "1",
  };
  const FILTER_GROUP = { catalog: "cat", noCatalog: "cat", full: "full", noFull: "full", free: "free", data: "data" };

  function applyFilters() {
    const panel = state.panel;
    const cards = S.findCards();
    state.applying = true;

    try {
      // índice original estável, inclusive para cards que o ML acrescentar depois
      let nextIndex = cards.reduce((max, card) => Math.max(max, Number(card.dataset.radarOriginalIndex ?? -1)), -1) + 1;
      for (const card of cards) {
        if (card.dataset.radarOriginalIndex == null) card.dataset.radarOriginalIndex = String(nextIndex++);
      }

      const active = Object.entries(state.filters).filter(([, on]) => on).map(([key]) => key);
      const passes = (card, keys) => keys.every((key) => FILTER_TESTS[key](card.dataset));

      let visibleCount = 0;
      for (const card of cards) {
        const visible = passes(card, active);
        card.style.display = visible ? "" : "none";
        const strip = state.strips.get(card);
        if (strip) setVisible(strip.host, visible);
        if (visible) visibleCount += 1;
      }

      if (panel) {
        // Contagem de cada filtro: quantos cards sobram se ele for ligado, mantendo os outros grupos.
        for (const [key] of FILTER_ROWS) {
          const others = active.filter((k) => FILTER_GROUP[k] !== FILTER_GROUP[key]);
          const count = cards.filter((card) => passes(card, others) && FILTER_TESTS[key](card.dataset)).length;
          const entry = panel.rows.get(key);
          entry.count.textContent = String(count);
          entry.row.setAttribute("aria-checked", String(Boolean(state.filters[key])));
          entry.row.classList.toggle("is-on", Boolean(state.filters[key]));
          entry.row.classList.toggle("is-empty", count === 0 && !state.filters[key]);
        }

        const total = cards.length;
        const catalogs = cards.filter((c) => c.dataset.radarCatalog === "1").length;
        const fulls = cards.filter((c) => c.dataset.radarFull === "1").length;
        const both = cards.filter((c) => c.dataset.radarCatalog === "1" && c.dataset.radarFull === "1").length;
        panel.kpiNodes.catalog.textContent = String(catalogs);
        panel.kpiNodes.full.textContent = String(fulls);
        panel.kpiNodes.both.textContent = String(both);
        panel.title.textContent = total + (total === 1 ? " item" : " itens");
        panel.sampleText.textContent = "Amostra de 1 página · " + total + (total === 1 ? " item" : " itens");
        panel.shown.textContent = visibleCount === total ? "Mostrando todos" : "Mostrando " + visibleCount + " de " + total;

        for (const [key, button] of panel.sortButtons) {
          button.setAttribute("aria-pressed", String(state.sort === key));
          button.classList.toggle("is-on", state.sort === key);
        }
      }

      const parents = new Set(cards.map((card) => card.parentElement).filter(Boolean));
      const mustSort = state.sort !== "original" || state.reordered;

      if (mustSort && parents.size === 1) {
        const parent = [...parents][0];
        const read = (card, key, fallback) => Number(card.dataset[key] ?? fallback);
        const compare = {
          sold: (a, b) => read(b, "radarSold", -1) - read(a, "radarSold", -1),
          revenue: (a, b) => read(b, "radarRev", -1) - read(a, "radarRev", -1),
          low: (a, b) => {
            const pa = read(a, "radarPrice", -1);
            const pb = read(b, "radarPrice", -1);
            return (pa < 0 ? Infinity : pa) - (pb < 0 ? Infinity : pb);
          },
          high: (a, b) => read(b, "radarPrice", -1) - read(a, "radarPrice", -1),
        }[state.sort];

        const sorted = [...cards].sort((a, b) => {
          const diff = compare ? compare(a, b) : 0;
          return diff || read(a, "radarOriginalIndex", 0) - read(b, "radarOriginalIndex", 0);
        });

        for (const card of sorted) parent.appendChild(card);
        state.reordered = state.sort !== "original";
      }
    } finally {
      // Descarta as mutações geradas aqui: não podem disparar novo ciclo.
      observer.takeRecords();
      state.applying = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* "comparar com meus anúncios" (sob demanda)                          */
  /* ------------------------------------------------------------------ */

  async function compareSearch() {
    const query = S.extractQuery();
    const items = [...state.observed.values()]
      .filter((item) => item.price > 0)
      .slice(0, 12)
      .map((item) => ({ id: item.id, price: item.price }));

    if (!query || !items.length) return { ok: false, message: "Abra uma busca do Mercado Livre para comparar." };

    const settings = await getSettings();
    const response = await send("/api/extension/search-profitability", "POST", {
      query,
      items,
      taxPercent: settings.taxPercent,
      operatingCost: settings.operatingCost,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
    });

    if (response?.status === 401) return { ok: false, auth: true, message: "Entre no Mercado Radar para comparar com seus anúncios." };
    if (!response?.ok) return { ok: false, message: response?.body?.error || "Não foi possível comparar agora." };
    if (response.body?.needsCost) return { ok: false, message: response.body.message || "Encontrei seu produto, mas falta cadastrar o custo." };
    if (!Array.isArray(response.body?.items) || !response.body.items.length) {
      return { ok: false, message: response.body?.message || "Nenhum produto seu parecido com esta busca." };
    }

    for (const economics of response.body.items) state.economics.set(economics.id, economics);
    state.dataVersion += 1;
    applyCards(S.findCards());

    const matched = response.body.matchedProduct;
    return {
      ok: true,
      message: matched
        ? "Margem calculada com o custo de " + matched.title + " (" + matched.similarityPercent + "% parecido). Veja \"Sua margem\" em cada card."
        : "Margem carregada nos cards.",
    };
  }

  /* ------------------------------------------------------------------ */
  /* busca: leitura da página → Radar                                    */
  /* ------------------------------------------------------------------ */

  function forceRefresh() {
    state.lastKey = "";
    state.status = "idle";
    schedule(50);
  }

  function finishSearch(status, message) {
    state.status = status;
    state.statusMessage = message || "";
    state.dataVersion += 1; // força os cards a redesenhar com o estado novo
    applyCards(S.findCards());
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
      setNotice("ok");
      applyCards(cards); // mostra os dados da página enquanto o Radar responde

      const response = await send("/api/extension/observations", "POST", {
        page: "search",
        query: query || null,
        items: observed,
      });

      if (response.contextLost) {
        finishSearch("error", response.body.error);
        return;
      }

      if (response.status === 401) {
        state.auth = { authenticated: false, nickname: null };
        setNotice(
          "auth",
          "Entre no Mercado Radar para ver vendas, faturamento e visitas por dia. Enquanto isso, os cards mostram o que a página informa.",
          "Entrar no Mercado Radar",
          () => void loginFlow((msg) => setNotice("error", msg, "Tentar de novo", forceRefresh)),
        );
        finishSearch("auth");
        return;
      }

      if (response.status === 429) {
        setNotice("limit", response.body?.error || "Limite diário da extensão atingido. Os cards mostram só o que a página informa.");
        finishSearch("limit", response.body?.error);
        return;
      }

      if (!response.ok || !Array.isArray(response.body?.items)) {
        setNotice(
          "error",
          (response.timeout ? "O Radar demorou para responder." : response.body?.error || "Não foi possível medir esta busca.") + " Os cards mostram só o que a página informa.",
          "Tentar de novo",
          forceRefresh,
        );
        finishSearch("error", response.body?.error);
        return;
      }

      state.auth = { authenticated: true, nickname: state.auth?.nickname || null };
      for (const insight of response.body.items) state.insights.set(insight.id, insight);
      setNotice("ok");
      finishSearch("ok");
    } catch (error) {
      setNotice("error", "Não foi possível medir esta busca.", "Tentar de novo", forceRefresh);
      finishSearch("error", error instanceof Error ? error.message : "");
    } finally {
      state.running = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* anúncio: painel                                                     */
  /* ------------------------------------------------------------------ */

  function createPdp(observation) {
    const { host, root } = makeHost("widget");
    const body = h("div", { class: "widget__body" });
    const wrap = h("section", { class: "widget", "aria-label": "Análise do Mercado Radar" }, body);
    root.append(wrap);

    return {
      ref: observation.id,
      observation,
      host,
      root,
      wrap,
      body,
      status: "loading", // loading | ok | auth | limit | error
      message: "",
      insight: null,
      listingType: observation.listingTypeHint === "PREMIUM" ? "PREMIUM" : "CLASSIC",
      fees: {}, // { CLASSIC: {fees, shippingKnown} | {error} }
      feesBusy: false,
      settings: null,
      calcOpen: false,
      calcResult: null,
      calcBusy: false,
      calcError: null,
      cost: null,
      costLooked: false,
      matchedTitle: null,
      howOpen: false,
      watch: "idle", // idle | saving | done | error
      watchMessage: "",
      market: null, // { busy, error, data, competitors, catalog }
      sellerHost: null,
      floating: false,
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

  function metricBlock(label, valueNode, tip) {
    const block = h(
      "div",
      { class: "metric" },
      h("div", { class: "metric__value" }, valueNode),
      h("div", { class: "metric__label" }, label),
      tip ? h("span", { class: "metric__info" }, infoButton(tip, "Como calculamos " + label)) : null,
    );
    if (tip) attachTip(block, tip);
    return block;
  }

  function demandHeaderPill(pdp) {
    const insight = pdp.insight;
    const obs = pdp.observation;
    const e = insight?.estimate;
    let key = insight?.demand && e?.salesPerDay?.value != null ? insight.demand : approxDemand(obs) || insight?.demand || null;
    const approx = !(insight?.demand && e?.salesPerDay?.value != null);
    const d = DEMAND[key];
    if (!d) return null;
    const pill = h("span", { class: "pill pill--" + d.tone + (approx ? " pill--approx" : ""), tabindex: "0", text: "Demanda " + d.label.toLowerCase() });
    attachTip(
      pill,
      approx
        ? "Demanda aproximada pela faixa de vendidos, avaliações e selo de mais vendido. Ainda não há ritmo medido."
        : "Baixa: menos de 0,7 venda por dia. Média: 0,7 a 3. Alta: 3 a 10. Excelente: 10 ou mais.",
    );
    return pill;
  }

  function accumulatedSummary(pdp, { showScore }) {
    const obs = pdp.observation;
    const e = pdp.insight?.estimate;
    const sold = obs.soldLower ?? e?.sold?.lower ?? null;
    const price = obs.price ?? pdp.insight?.price ?? null;
    const revenue = sold != null && price ? sold * price : null;

    const blocks = [
      metricBlock(
        "Vendidos",
        h("span", { text: sold == null ? "—" : soldText(sold, obs.soldHasPlus !== false) }),
        "Faixa de vendidos que a página mostra. É o total desde que o anúncio existe.",
      ),
      metricBlock(
        "Receita acum.",
        h("span", { text: revenue == null ? "—" : moneyCompact(revenue) + (obs.soldHasPlus !== false ? "+" : "") }),
        "Menor faixa de vendidos × preço atual. É um piso do que o anúncio já faturou, não o faturamento de hoje.",
      ),
    ];
    if (showScore && pdp.insight) {
      blocks.push(
        metricBlock(
          "Score",
          h("span", {}, String(pdp.insight.score), h("small", { class: "of100", text: "/100" })),
          "Saúde de 0 a 100: vendas, avaliações, frete e histórico. Sem ritmo medido, o teto é 60.",
        ),
      );
    } else if (obs.reviews != null) {
      blocks.push(
        metricBlock(
          "Avaliações",
          h("span", { text: num(obs.reviews, 0) }),
          "Número de avaliações que a página mostra" + (obs.rating ? " (nota " + num(obs.rating) + ")." : "."),
        ),
      );
    }
    return h("div", { class: "metrics metrics--" + blocks.length }, ...blocks);
  }

  function performanceNode(pdp) {
    const insight = pdp.insight;
    const obs = pdp.observation;

    if (pdp.status === "loading") {
      return h(
        "div",
        { class: "metrics" },
        ...[0, 1, 2, 3].map(() => h("div", { class: "metric metric--skeleton" }, h("div", { class: "skeleton" }), h("div", { class: "skeleton skeleton--short" }))),
      );
    }

    if (pdp.status !== "ok" || !insight) {
      const copy =
        pdp.status === "auth"
          ? "Entre no Mercado Radar para ver visitas, vendas e faturamento por dia deste anúncio."
          : pdp.status === "limit"
            ? pdp.message || "Limite diário da extensão atingido."
            : (pdp.message || "Não foi possível medir este anúncio agora.") + " Abaixo, o que a página mostra.";
      return h(
        "div",
        {},
        accumulatedSummary(pdp, { showScore: false }),
        h(
          "div",
          { class: "notice notice--inline" + (pdp.status === "limit" ? " notice--warn" : pdp.status === "error" ? " notice--risk" : "") },
          h("div", { text: copy }),
          pdp.status === "limit"
            ? null
            : h("button", {
                class: "btn btn--block",
                type: "button",
                text: pdp.status === "auth" ? "Entrar no Mercado Radar" : "Tentar de novo",
                onClick: () =>
                  pdp.status === "auth"
                    ? void loginFlow((msg) => {
                        pdp.status = "error";
                        pdp.message = msg;
                        renderPdp(pdp);
                      })
                    : void loadPdp(pdp),
              }),
        ),
      );
    }

    const e = insight.estimate;
    const hasRate = e.salesPerDay?.value != null;

    if (!hasRate) {
      return h(
        "div",
        {},
        accumulatedSummary(pdp, { showScore: true }),
        h(
          "div",
          { class: "notice notice--inline" },
          h("b", { text: "Ainda sem ritmo medido. " }),
          "O Radar tem uma única leitura deste anúncio e não sabe a idade dele. Abra esta página de novo outro dia (ou em alguns dias) para medir vendas e visitas por dia.",
        ),
      );
    }

    const tilde = (field) => (isEstimated(e, field) ? "~" : "");
    const visits = e.visitsPerDay;
    const sales = e.salesPerDay;
    const revenue = e.revenuePerDay;
    const salesRange = rangeText(sales, (v) => num(v));
    const revenueRange = rangeText(revenue, (v) => moneyCompact(v));
    const visitsRange = rangeText(visits, (v) => num(v, 0));
    const conversion = e.conversion?.value ? pct(e.conversion.value * 100) : "—";

    return h(
      "div",
      { class: "metrics metrics--4" },
      metricBlock(
        "Visitas/dia",
        h("span", { text: visits?.value == null ? "—" : tilde("visits") + num(visits.value, 0) }),
        "Vendas por dia ÷ conversão de " + conversion + "." + (visitsRange ? " Faixa provável: " + visitsRange + "." : "") + " A página não mostra visitas de outros vendedores, por isso é estimado.",
      ),
      metricBlock(
        "Vendas/dia",
        h("span", { text: tilde("sales") + num(sales.value) }),
        (e.method === "HISTORICO"
          ? "Novas avaliações entre as leituras do Radar, convertidas em vendas."
          : e.method === "OFICIAL"
            ? "Pedidos reais da sua conta nos últimos " + (e.windowDays || 30) + " dias."
            : "Vendidos acumulados ÷ idade do anúncio.") + (salesRange ? " Faixa provável: " + salesRange + "." : ""),
      ),
      metricBlock(
        "Faturamento/dia",
        h("span", { text: revenue?.value == null ? "—" : tilde("revenue") + moneyCompact(revenue.value) }),
        "Vendas por dia × preço deste anúncio (" + brl(obs.price) + ")." + (revenueRange ? " Faixa provável: " + revenueRange + " por dia." : ""),
      ),
      metricBlock(
        "Score",
        h("span", {}, String(insight.score), h("small", { class: "of100", text: "/100" })),
        "Saúde de 0 a 100: ritmo de vendas, faturamento, vendidos acumulados, nota e logística.",
      ),
    );
  }

  function feesFor(pdp, type) {
    return pdp.fees[type] || null;
  }

  function shippingEstimate(pdp, entry) {
    if (entry?.shippingKnown) return { value: Number(entry.fees.shippingCost) || 0, known: true };
    const est = Number(pdp.settings?.shippingEstimate || 0);
    return { value: est, known: false, set: est > 0 };
  }

  function receiveAmount(pdp, entry) {
    const price = pdp.observation.price;
    const ship = shippingEstimate(pdp, entry);
    return price - Number(entry.fees.commissionAmount || 0) - Number(entry.fees.fixedFee || 0) - ship.value;
  }

  function commissionChip(pdp, type, label) {
    const entry = feesFor(pdp, type);
    const active = pdp.listingType === type;
    const percent = entry?.fees ? pct(entry.fees.commissionPercent) : null;
    const button = h(
      "button",
      {
        class: "ctype" + (active ? " is-on" : ""),
        type: "button",
        "aria-pressed": String(active),
        onClick: () => {
          pdp.listingType = type;
          renderPdp(pdp);
          if (!feesFor(pdp, type)) void loadPdpFees(pdp, type);
        },
      },
      h("span", { class: "ctype__name", text: label }),
      entry?.error ? h("span", { class: "ctype__pct", text: "erro" }) : percent ? h("span", { class: "ctype__pct", text: percent }) : null,
    );
    attachTip(button, "Mostra o que você recebe se este anúncio for " + label + (percent ? " (comissão de " + percent + ")." : ". Clique para consultar a comissão."));
    return button;
  }

  function payoutNode(pdp) {
    if (pdp.status === "auth" || pdp.status === "limit") return null;
    if (pdp.status === "loading") return h("div", { class: "payout" }, h("div", { class: "skeleton" }), h("div", { class: "skeleton skeleton--short" }));

    const entry = feesFor(pdp, pdp.listingType);
    const head = h(
      "div",
      { class: "payout__title" },
      h("span", { text: "Você recebe" }),
      infoButton(
        "Valor que o Mercado Livre repassa: preço menos comissão e frete. Não inclui o custo do produto nem o seu imposto. Clique em Clássico ou Premium para ver a conta de cada tipo.",
        "Como calculamos o que você recebe",
      ),
    );

    if (!entry) {
      return h("div", { class: "payout" }, head, h("div", { class: "skeleton" }), h("div", { class: "muted", text: "Consultando comissão…" }));
    }

    if (entry.error) {
      return h(
        "div",
        { class: "payout" },
        head,
        h("div", { class: "muted", text: entry.error }),
        h("div", { class: "payout__types" }, commissionChip(pdp, "CLASSIC", "Clássico"), commissionChip(pdp, "PREMIUM", "Premium")),
      );
    }

    const ship = shippingEstimate(pdp, entry);
    const receive = receiveAmount(pdp, entry);
    const shipNode = ship.known || ship.set
      ? h("b", { text: brl(ship.value) })
      : h("b", { class: "payout__soft", text: "a informar" });

    return h(
      "div",
      { class: "payout" },
      head,
      h(
        "div",
        { class: "payout__row" },
        h("div", { class: "payout__value" }, h("span", { class: "payout__amount", text: brl(receive) })),
        h("div", { class: "payout__sep" }),
        h("div", { class: "payout__ship" }, h("span", { text: ship.known ? "Frete" : "Frete est." }), shipNode),
      ),
      h("div", { class: "payout__comm" }, h("span", { text: "Comissão" }), h("div", { class: "payout__types" }, commissionChip(pdp, "CLASSIC", "Clássico"), commissionChip(pdp, "PREMIUM", "Premium"))),
      ship.known || ship.set
        ? null
        : h("div", { class: "muted payout__note", text: "Anúncio de outro vendedor: o frete depende do peso e da reputação. Informe seu frete médio em Configurações para entrar na conta." }),
    );
  }

  async function ensureCost(pdp) {
    if (pdp.costLooked) return;
    pdp.costLooked = true;
    const settings = pdp.settings || (await getSettings());
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
      pdp.matchedTitle = matched.title || null;
    }
  }

  async function runCalc(pdp) {
    if (pdp.cost == null) return;
    pdp.calcBusy = true;
    pdp.calcError = null;
    renderPdp(pdp);

    const settings = pdp.settings || (await getSettings());
    const entry = feesFor(pdp, pdp.listingType);
    const ship = shippingEstimate(pdp, entry);
    const obs = pdp.observation;
    const response = await send("/api/extension/profitability", "POST", {
      itemId: obs.id,
      salePrice: obs.price || undefined,
      supplierPrice: pdp.cost,
      discountPercent: 0,
      kitQuantity: 1,
      taxPercent: settings.taxPercent,
      // frete médio informado entra como custo operacional quando a API não conhece o frete
      operatingCost: settings.operatingCost + (ship.known ? 0 : ship.value),
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
      title: obs.title || undefined,
      categoryId: obs.categoryId || undefined,
      listingType: pdp.listingType,
      freeShipping: Boolean(obs.freeShipping),
    });

    pdp.calcBusy = false;
    if (response?.status === 401) {
      pdp.status = "auth";
      pdp.calcError = "Entre no Mercado Radar para calcular o lucro.";
    } else if (!response?.ok || !response.body?.result) {
      pdp.calcError = response?.body?.error || "Não foi possível calcular as tarifas deste anúncio.";
    } else {
      pdp.calcResult = { ...response.body, ship, settings };
    }
    renderPdp(pdp);
  }

  async function openCalc(pdp, { scroll = true } = {}) {
    pdp.calcOpen = true;
    renderPdp(pdp);
    if (scroll) pdp.host.scrollIntoView({ behavior: "smooth", block: "center" });
    if (pdp.status !== "ok" || pdp.costLooked) return;
    await ensureCost(pdp);
    if (pdp.cost != null) await runCalc(pdp);
    else renderPdp(pdp);
  }

  function calcNode(pdp) {
    const toggle = h(
      "button",
      {
        class: "calc__toggle",
        type: "button",
        "aria-expanded": String(pdp.calcOpen),
        onClick: () => {
          if (pdp.calcOpen) {
            pdp.calcOpen = false;
            renderPdp(pdp);
          } else void openCalc(pdp, { scroll: false });
        },
      },
      icon("calc"),
      h("span", { text: "Calcular lucro" }),
      h("span", { class: "calc__chev" }, icon("chevron")),
    );

    const wrap = h("div", { class: "calc" + (pdp.calcOpen ? " is-open" : "") }, toggle);
    if (!pdp.calcOpen) return wrap;

    if (pdp.status === "auth") {
      wrap.append(
        h(
          "div",
          { class: "calc__body" },
          h("div", { class: "muted", text: "Entre no Mercado Radar para calcular comissão, frete e lucro." }),
          h("button", { class: "btn btn--block", type: "button", text: "Entrar no Mercado Radar", onClick: () => void loginFlow() }),
        ),
      );
      return wrap;
    }

    const input = h("input", {
      type: "number",
      min: "0",
      step: "0.01",
      placeholder: "Custo do produto (R$)",
      value: pdp.cost != null ? String(pdp.cost) : null,
      "aria-label": "Custo do produto",
    });
    const submit = () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || input.value === "") return;
      pdp.cost = value;
      void runCalc(pdp);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });

    const body = h(
      "div",
      { class: "calc__body" },
      h(
        "div",
        { class: "cost-row" },
        input,
        h("button", { class: "btn", type: "button", text: pdp.calcBusy ? "Calculando…" : pdp.calcResult ? "Recalcular" : "Calcular", disabled: pdp.calcBusy, onClick: submit }),
      ),
      pdp.matchedTitle ? h("div", { class: "muted", text: "Custo de \"" + pdp.matchedTitle + "\" (produto seu mais parecido). Altere se precisar." }) : null,
      pdp.calcError ? h("div", { class: "muted muted--risk", text: pdp.calcError }) : null,
    );

    const calc = pdp.calcResult;
    if (calc?.result) {
      const { fees, result, ship } = calc;
      const line = (label, value, className) =>
        h("div", { class: "line" + (className ? " " + className : "") }, h("span", { text: label }), h("b", { text: value }));
      const lines = [
        line("Preço de venda", brl(result.salePrice)),
        line("Comissão (" + pct(fees.commissionPercent) + ")", "− " + brl(fees.commissionAmount), "neg"),
      ];
      if (Number(fees.fixedFee) > 0) lines.push(line("Tarifa fixa", "− " + brl(fees.fixedFee), "neg"));
      lines.push(
        ship.known || ship.value > 0
          ? line(ship.known ? "Frete" : "Frete estimado", "− " + brl(ship.value), "neg")
          : line("Frete", "não incluído", "dim"),
      );
      if (Number(fees.taxAmount) > 0) lines.push(line("Imposto (" + pct(fees.taxPercent) + ")", "− " + brl(fees.taxAmount), "neg"));
      lines.push(line("Custo do produto", "− " + brl(result.purchaseCost), "neg"));
      lines.push(line("Lucro por venda", brl(result.profit), "total" + (result.profit <= 0 ? " risk" : "")));
      body.append(
        h("div", { class: "payout-lines" }, ...lines),
        h("div", { class: "muted", text: "Margem " + pct(result.marginPercent) + " · ROI " + pct(result.roiPercent) + " · preço mínimo saudável " + brl(result.minimumSuggestedPrice) }),
      );
    } else if (!pdp.calcBusy) {
      body.append(h("div", { class: "muted", text: "Informe o custo para ver lucro, margem e ROI." }));
    }
    wrap.append(body);
    return wrap;
  }

  function howNode(pdp) {
    const e = pdp.insight?.estimate;
    if (!e) return null;

    const facts = [];
    if (e.salesPerDay?.value != null) {
      facts.push(["Vendidos (total)", e.sold?.lower == null ? "—" : e.sold.exact ? num(e.sold.lower, 0) : num(e.sold.lower, 0) + " a " + num(e.sold.upper, 0)]);
      facts.push(["Vendas/mês", "~" + num(e.salesPerDay.value * 30, 0)]);
    }
    facts.push(["Conversão usada", pct((e.conversion?.value || 0) * 100)]);
    if (e.ageDays?.value != null) facts.push(["Idade do anúncio", num(e.ageDays.value, 0) + " dias" + (e.ageDays.source === "ID_ESTIMADO" ? " (estimada)" : "")]);
    facts.push(["Leituras do Radar", String(e.observations || 1)]);
    if (pdp.insight.bestSellerLabel) facts.push(["Destaque", pdp.insight.bestSellerLabel]);

    const details = h(
      "details",
      { class: "how" },
      h("summary", {}, h("span", { text: "Como o Radar calculou" }), methodBadge(e)),
      h("ul", {}, ...(e.basis || []).map((line) => h("li", { text: line }))),
      h("div", { class: "facts" }, ...facts.map(([label, value]) => h("div", { class: "fact" }, h("span", { text: label }), h("b", { text: value })))),
    );
    if (pdp.howOpen) details.setAttribute("open", "");
    details.addEventListener("toggle", () => {
      pdp.howOpen = details.open;
    });
    return details;
  }

  function marketNode(pdp) {
    const m = pdp.market;
    if (!m) return null;
    if (m.busy) return h("div", { class: "block" }, h("div", { class: "skeleton" }), h("div", { class: "skeleton skeleton--short" }));
    if (m.error) return h("div", { class: "block muted", text: m.error });

    const market = m.data;
    const winner = m.catalog?.buyBoxWinner;
    const price = pdp.observation.price;
    const nodes = [
      h("div", { class: "block__title", text: "Faixa de preço do mercado" }),
      h(
        "div",
        { class: "facts facts--3" },
        h("div", { class: "fact" }, h("span", { text: "25% mais baratos" }), h("b", { text: brl(market.p25, 0) })),
        h("div", { class: "fact" }, h("span", { text: "Mediana" }), h("b", { text: brl(market.median, 0) })),
        h("div", { class: "fact" }, h("span", { text: "25% mais caros" }), h("b", { text: brl(market.p75, 0) })),
      ),
      h("div", {
        class: "muted",
        text:
          market.count +
          " comparáveis · " +
          (market.gapToMedian == null ? "sem comparação" : "este anúncio " + (market.gapToMedian >= 0 ? "+" : "") + pct(market.gapToMedian) + " vs mediana"),
      }),
    ];
    if (winner?.price) {
      const delta = price ? ((price - winner.price) / winner.price) * 100 : null;
      nodes.push(
        h("div", { class: "block__title mt", text: "Buy Box do catálogo" }),
        h(
          "div",
          { class: "muted", text: brl(winner.price) + " · " + (winner.logisticType ? logisticText(winner.logisticType) + " · " : "") + (winner.freeShipping ? "frete grátis" : "frete pago") + (delta == null ? "" : " · este anúncio " + (delta >= 0 ? "+" : "") + pct(delta)) },
        ),
      );
    }
    if (m.competitors?.length) {
      nodes.push(
        h("div", { class: "rows mt" }, ...m.competitors.slice(0, 4).map((c) => h("div", { class: "row" }, h("span", { text: c.title }), h("b", { text: brl(c.price) })))),
      );
    }
    return h("div", { class: "block" }, ...nodes);
  }

  async function loadPdpMarket(pdp) {
    const obs = pdp.observation;
    pdp.market = { busy: true };
    renderPdp(pdp);

    // detalhes oficiais (buy box do catálogo): só existem para anúncios liberados pela API
    let catalog = null;
    let apiItem = null;
    const itemParams = new URLSearchParams({ id: obs.id });
    if (obs.price) itemParams.set("visiblePrice", String(obs.price));
    const item = await send("/api/extension/item?" + itemParams.toString());
    if (item?.status === 401) {
      pdp.market = { error: "Entre no Mercado Radar para ver o mercado deste anúncio." };
      pdp.status = "auth";
      renderPdp(pdp);
      return;
    }
    if (item?.ok && item.body?.item) {
      apiItem = item.body.item;
      catalog = item.body.catalog || null;
    }

    const params = new URLSearchParams({ title: obs.title, itemId: obs.id, currentPrice: String(obs.price || 0) });
    const categoryId = apiItem?.categoryId || obs.categoryId;
    if (categoryId) params.set("categoryId", categoryId);
    const response = await send("/api/extension/market?" + params.toString());

    if (!response?.ok || !response.body?.market) {
      pdp.market = { error: response?.body?.error || "Sem dados de mercado para este anúncio." };
    } else {
      pdp.market = {
        data: response.body.market,
        competitors: Array.isArray(response.body.competitors) ? response.body.competitors : [],
        catalog,
      };
    }
    renderPdp(pdp);
  }

  async function watchPdp(pdp) {
    if (pdp.watch === "saving") return;
    pdp.watch = "saving";
    pdp.watchMessage = "";
    renderPdp(pdp);
    const response = await send("/api/extension/watchlist", "POST", { itemId: pdp.observation.id, referenceId: pdp.ref });
    if (response?.status === 401) {
      pdp.watch = "error";
      pdp.watchMessage = "Entre no Mercado Radar para monitorar.";
    } else if (response?.ok) {
      pdp.watch = "done";
    } else {
      pdp.watch = "error";
      pdp.watchMessage = response?.body?.error || "Não foi possível monitorar. Tente de novo.";
    }
    renderPdp(pdp);
    return pdp.watch === "done";
  }

  function actionsNode(pdp) {
    const watchLabel = pdp.watch === "saving" ? "Salvando…" : pdp.watch === "done" ? "Monitorando" : "Monitorar este anúncio";
    return h(
      "div",
      { class: "actions" },
      h("button", {
        class: "btn btn--ghost btn--block",
        type: "button",
        text: watchLabel,
        disabled: pdp.watch === "saving" || pdp.watch === "done",
        onClick: () => void watchPdp(pdp),
      }),
      !pdp.market
        ? h("button", { class: "btn btn--ghost btn--block", type: "button", text: "Ver faixa de preço do mercado", onClick: () => void loadPdpMarket(pdp) })
        : null,
      pdp.watchMessage ? h("div", { class: "muted muted--risk", text: pdp.watchMessage }) : null,
    );
  }

  function renderPdp(pdp) {
    const pill = demandHeaderPill(pdp);
    const header = h(
      "div",
      { class: "widget__head" },
      h("span", { class: "brand" }, markIcon(), "Mercado Radar"),
      pill,
    );
    const head = h("div", { class: "widget__top" }, header);

    pdp.body.replaceChildren(
      ...[head, performanceNode(pdp), payoutNode(pdp), calcNode(pdp), howNode(pdp), marketNode(pdp), actionsNode(pdp)].filter(Boolean),
    );
    renderSeller(pdp);
  }

  /* cartão do vendedor: só o que a página mostra */
  function sellerCard(info, obs) {
    const chips = [];
    const chip = (iconName, text, extraClass, tip) => {
      const el = h("span", { class: "schip" + (extraClass ? " " + extraClass : ""), tabindex: tip ? "0" : null }, iconName ? icon(iconName) : null, text);
      if (tip) attachTip(el, tip);
      return el;
    };
    if (info.city) chips.push(chip("pin", info.city));
    if (info.reputation) {
      chips.push(h("span", { class: "schip" }, h("i", { class: "dot dot--" + info.reputation.tone }), info.reputation.label));
    }
    if (info.leader) chips.push(chip("check", info.leader));
    if (info.sales) chips.push(chip("tag", info.sales));
    if (obs.listingTypeHint) {
      chips.push(
        chip("box", "Anúncio: " + (obs.listingTypeHint === "PREMIUM" ? "Premium" : "Clássico"), "", "Inferido pelo parcelamento sem juros (Premium) ou pela falta dele (Clássico). O Mercado Livre não informa o tipo na página."),
      );
    }

    const copyButton = h("button", { class: "iconbtn", type: "button", "aria-label": "Copiar nome do vendedor" }, icon("copy"));
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(info.name || "");
        copyButton.replaceChildren(icon("check"));
        setTimeout(() => copyButton.replaceChildren(icon("copy")), 1200);
      } catch {
        // sem permissão de área de transferência: nada a fazer
      }
    });

    return h(
      "section",
      { class: "widget widget--seller", "aria-label": "Vendedor" },
      h(
        "div",
        { class: "seller" },
        h("div", { class: "seller__head" }, icon("user"), h("b", { class: "seller__name", text: info.name || "Vendedor" }), info.name ? copyButton : null, infoButton("Informações públicas do vendedor, lidas desta página do Mercado Livre.", "Sobre o vendedor")),
        chips.length ? h("div", { class: "seller__chips" }, ...chips) : null,
      ),
    );
  }

  function renderSeller(pdp) {
    const info = S.sellerInfo(pdp.observation.sellerName);
    if (!info || (!info.name && !info.city && !info.sales && !info.reputation && !info.leader)) {
      pdp.sellerHost?.remove();
      pdp.sellerHost = null;
      return;
    }

    if (!pdp.sellerHost) {
      pdp.sellerHost = makeHost("seller");
    }
    pdp.sellerHost.root.replaceChildren(sellerCard(info, pdp.observation));

    const { host } = pdp.sellerHost;
    if (!host.isConnected) {
      // sem âncora do vendedor na página: logo abaixo do nosso painel (nunca no modo flutuante)
      if (info.anchor) info.anchor.insertAdjacentElement("afterend", host);
      else if (!pdp.floating && pdp.host.isConnected) pdp.host.insertAdjacentElement("afterend", host);
    }
  }

  async function loadPdpFees(pdp, type) {
    if (pdp.feesBusy) return;
    pdp.feesBusy = true;
    const settings = pdp.settings || (pdp.settings = await getSettings());
    const obs = pdp.observation;
    const response = await send("/api/extension/profitability", "POST", {
      itemId: obs.id,
      salePrice: obs.price || undefined,
      supplierPrice: 0,
      discountPercent: 0,
      kitQuantity: 1,
      taxPercent: settings.taxPercent,
      operatingCost: 0,
      targetMarginPercent: settings.targetMarginPercent,
      targetRoiPercent: settings.targetRoiPercent,
      title: obs.title || undefined,
      categoryId: obs.categoryId || undefined,
      listingType: type,
      freeShipping: Boolean(obs.freeShipping),
    });
    pdp.feesBusy = false;

    if (response?.status === 401) {
      pdp.status = "auth";
    } else if (!response?.ok || !response.body?.fees) {
      pdp.fees[type] = { error: response?.body?.error || "Não foi possível calcular as tarifas deste anúncio." };
    } else {
      pdp.fees[type] = { fees: response.body.fees, shippingKnown: Boolean(response.body.shippingKnown) };
    }
    renderPdp(pdp);
  }

  async function loadPdp(pdp) {
    pdp.status = "loading";
    pdp.settings = await getSettings();
    renderPdp(pdp);

    // 1) desempenho: funciona para qualquer anúncio (leitura da página + histórico)
    const response = await send("/api/extension/observations", "POST", {
      page: "product",
      query: null,
      items: [pdp.observation],
    });
    if (response.contextLost) {
      pdp.status = "error";
      pdp.message = response.body.error;
      renderPdp(pdp);
      return;
    }

    if (response.status === 401) {
      state.auth = { authenticated: false, nickname: null };
      pdp.status = "auth";
    } else if (response.status === 429) {
      pdp.status = "limit";
      pdp.message = response.body?.error || "Limite diário da extensão atingido.";
    } else if (response.ok && Array.isArray(response.body?.items) && response.body.items[0]) {
      state.auth = { authenticated: true, nickname: state.auth?.nickname || null };
      pdp.insight = response.body.items[0];
      pdp.status = "ok";
    } else {
      pdp.status = "error";
      pdp.message = response.timeout ? "O Radar demorou para responder." : response.body?.error || "Não foi possível medir este anúncio.";
    }
    renderPdp(pdp);

    // 2) tarifas para o bloco "Você recebe" (só com login). Custo, mercado, buy box e monitorar são sob demanda.
    if (pdp.status === "ok") await loadPdpFees(pdp, pdp.listingType);
  }

  async function enrichProduct() {
    publishContext();
    if (!S.isProductPage()) return;

    const observation = S.pageObservation();
    if (!observation) return;

    if (state.pdp && state.pdp.ref === observation.id) {
      mountPdp(); // idempotente: só recoloca se o ML removeu o widget
      if (state.pdp.sellerHost && !state.pdp.sellerHost.host.isConnected) renderSeller(state.pdp);
      return;
    }

    if (state.pdpBusy) return;
    state.pdpBusy = true;

    try {
      state.pdp?.host.remove();
      state.pdp?.sellerHost?.host.remove();
      state.pdp = createPdp(observation);
      mountPdp();
      await loadPdp(state.pdp);
    } finally {
      state.pdpBusy = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* lançador e menu                                                     */
  /* ------------------------------------------------------------------ */

  async function openRadar(path, query) {
    const settings = await getSettings();
    const url = new URL(path, settings.apiBase);
    if (query) url.searchParams.set("q", query);
    window.open(url.toString(), "_blank", "noopener");
  }

  function mountLauncher() {
    if (state.launcher?.host.isConnected) return;
    if (!document.body) return;

    const { host, root } = makeHost("launcher");
    host.style.cssText = "all:initial;";

    const menu = h("div", { class: "menu", hidden: true, role: "menu" });
    const button = h(
      "button",
      {
        class: "launcher__btn",
        type: "button",
        "aria-label": "Abrir menu do Mercado Radar",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        onClick: () => {
          if (menu.hidden) void openMenu();
          else closeMenu();
        },
      },
      markIcon(),
    );

    let subNode = null;
    const closeMenu = () => {
      menu.hidden = true;
      subNode = null;
      button.setAttribute("aria-expanded", "false");
    };

    const showSub = (...nodes) => {
      subNode?.remove();
      subNode = h("div", { class: "menu__sub" }, ...nodes);
      menu.append(subNode);
      subNode.scrollIntoView({ block: "nearest" });
    };

    const message = (text, tone) => showSub(h("div", { class: "menu__msg" + (tone ? " menu__msg--" + tone : ""), text }));

    const item = ({ iconName, title, hint, onClick, disabled, danger, accent }) =>
      h(
        "button",
        {
          class: "menu__item" + (disabled ? " is-disabled" : "") + (danger ? " is-danger" : "") + (accent ? " is-accent" : ""),
          type: "button",
          role: "menuitem",
          "aria-disabled": disabled ? "true" : null,
          onClick: () => {
            subNode?.remove();
            subNode = null;
            onClick();
          },
        },
        h("span", { class: "menu__icon" }, icon(iconName)),
        h("span", { class: "menu__text" }, h("span", { class: "menu__title", text: title }), hint ? h("small", { text: hint }) : null),
      );

    const settingsForm = async () => {
      const settings = await getSettings();
      const field = (label, key, value, step) => {
        const input = h("input", { type: "number", min: "0", step, value: String(value), "data-key": key });
        return { input, node: h("label", { class: "field" }, h("span", { text: label }), input) };
      };
      const fields = [
        field("Imposto %", "radarTaxPercent", settings.taxPercent, "0.1"),
        field("Custo operacional (R$)", "radarOperatingCost", settings.operatingCost, "0.01"),
        field("Frete médio dos seus envios (R$)", "radarShippingEstimate", settings.shippingEstimate, "0.01"),
        field("Margem alvo %", "radarTargetMarginPercent", settings.targetMarginPercent, "1"),
        field("ROI alvo %", "radarTargetRoiPercent", settings.targetRoiPercent, "1"),
      ];
      const status = h("div", { class: "menu__msg" });
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
            if (state.pdp) {
              state.pdp.settings = await getSettings();
              renderPdp(state.pdp);
            }
            status.textContent = "Salvo. Vale para os próximos cálculos.";
          },
        }),
        status,
      );
    };

    const buildItems = () => {
      const pdp = state.pdp?.host.isConnected ? state.pdp : null;
      const onSearch = !pdp && Boolean(state.panel?.host.isConnected);
      const authed = state.auth?.authenticated === true;
      const unknownAuth = state.auth == null;
      const query = S.extractQuery() || pdp?.observation.title || null;

      const items = [
        item({
          iconName: "calc",
          title: "Calculadora de lucro",
          hint: pdp ? "Abre o cálculo deste anúncio" : "Disponível na página de um anúncio",
          disabled: !pdp,
          onClick: () => {
            if (!pdp) return message("Abra um anúncio do Mercado Livre para calcular comissão, frete e lucro.");
            closeMenu();
            void openCalc(pdp);
          },
        }),
        item({
          iconName: "eye",
          title: "Monitorar este anúncio",
          hint: !pdp ? "Disponível na página de um anúncio" : pdp.watch === "done" ? "Já está sendo monitorado" : authed || unknownAuth ? "Acompanha preço e vendas" : "Exige login",
          disabled: !pdp,
          onClick: async () => {
            if (!pdp) return message("Abra um anúncio do Mercado Livre para monitorá-lo.");
            if (pdp.watch === "done") return message("Este anúncio já está na sua lista de monitoramento.");
            message("Salvando…");
            const ok = await watchPdp(pdp);
            message(ok ? "Pronto: o anúncio está sendo monitorado." : pdp.watchMessage || "Não foi possível monitorar.", ok ? "ok" : "risk");
          },
        }),
        item({
          iconName: "compare",
          title: "Comparar com meus anúncios",
          hint: authed || unknownAuth ? "Mostra sua margem neste preço" : "Exige login",
          disabled: !pdp && !onSearch,
          onClick: async () => {
            if (!pdp && !onSearch) return message("Abra uma busca ou um anúncio do Mercado Livre para comparar.");
            message("Procurando seu produto mais parecido…");
            if (pdp) {
              await ensureCost(pdp);
              if (pdp.cost == null) {
                return message(pdp.status === "auth" ? "Entre no Mercado Radar para comparar com seus anúncios." : "Nenhum produto seu parecido com custo cadastrado. Cadastre o custo no painel ou informe em Calcular lucro.", "warn");
              }
              pdp.calcOpen = true;
              await runCalc(pdp);
              const r = pdp.calcResult?.result;
              return message(
                r
                  ? "Com o custo de " + brl(pdp.cost) + (pdp.matchedTitle ? " (" + pdp.matchedTitle + ")" : "") + ", você lucraria " + brl(r.profit) + " por venda (margem " + pct(r.marginPercent) + ")."
                  : pdp.calcError || "Não foi possível comparar agora.",
                r && r.profit > 0 ? "ok" : "warn",
              );
            }
            const result = await compareSearch();
            if (result.auth) state.auth = { authenticated: false, nickname: null };
            message(result.message, result.ok ? "ok" : "warn");
          },
        }),
        item({
          iconName: "chart",
          title: "Ver na tela Mercado",
          hint: query ? "Abre esta pesquisa no painel" : "Abre a tela Mercado no painel",
          onClick: () => {
            void openRadar("/mercado", query);
            closeMenu();
          },
        }),
        item({
          iconName: "barcode",
          title: "Pesquisa por EAN",
          hint: "Abre a pesquisa por código no painel",
          onClick: () => {
            void openRadar("/ean");
            closeMenu();
          },
        }),
        item({ iconName: "sliders", title: "Configurações", hint: "Imposto, frete, custo e metas", onClick: () => void settingsForm() }),
        item({
          iconName: "panel",
          title: "Painel Mercado Radar",
          hint: "Abre o painel completo",
          onClick: () => {
            void openRadar("/");
            closeMenu();
          },
        }),
        authed
          ? item({
              iconName: "logout",
              title: "Sair",
              hint: state.auth?.nickname ? "Conectado como " + state.auth.nickname : "Desconecta esta extensão",
              danger: true,
              onClick: async () => {
                message("Saindo…");
                try {
                  await chrome.runtime.sendMessage({ type: "RADAR_AUTH_LOGOUT" });
                } catch {
                  // extensão recarregada
                }
                state.auth = { authenticated: false, nickname: null };
                state.insights.clear();
                state.dataVersion += 1;
                forceRefresh();
                if (state.pdp) {
                  state.pdp.fees = {};
                  state.pdp.insight = null;
                  state.pdp.calcResult = null;
                  void loadPdp(state.pdp);
                }
                message("Você saiu do Mercado Radar.", "ok");
                setTimeout(() => void openMenu(false), 900);
              },
            })
          : item({
              iconName: "login",
              title: "Entrar",
              hint: "Sem login só vemos o que a página mostra",
              accent: true,
              onClick: async () => {
                message("Abrindo o login…");
                const result = await loginFlow();
                message(result?.authenticated ? "Conectado. Atualizando os números." : result?.error || "Não foi possível entrar.", result?.authenticated ? "ok" : "risk");
                if (result?.authenticated) setTimeout(() => void openMenu(false), 1200);
              },
            }),
      ];
      return items;
    };

    async function openMenu(refresh = true) {
      if (refresh && state.auth == null) await refreshAuth();
      menu.replaceChildren(
        h("div", { class: "menu__head" }, h("span", { class: "brand" }, markIcon(), "Mercado Radar"), h("span", { class: "menu__state" + (state.auth?.authenticated ? " is-on" : ""), text: state.auth?.authenticated ? (state.auth.nickname || "Conectado") : "Sem login" })),
        ...buildItems(),
      );
      subNode = null;
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      if (refresh) void refreshAuth().then((auth) => {
        // estado mudou enquanto o menu estava aberto sem sub-painel: redesenha
        if (!menu.hidden && !subNode && auth && (auth.authenticated !== (menu.dataset.auth === "1"))) {
          menu.dataset.auth = auth.authenticated ? "1" : "0";
          void openMenu(false);
        }
      });
      menu.dataset.auth = state.auth?.authenticated ? "1" : "0";
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) closeMenu();
    });
    document.addEventListener("click", (event) => {
      if (!menu.hidden && !event.composedPath().includes(host)) closeMenu();
    });

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
    state.pdp?.sellerHost?.host.remove();
    state.pdp = null;
    state.lastKey = "";
    state.status = "idle";
    state.insights.clear();
    state.observed.clear();
    state.economics.clear();
    state.reordered = false;
    state.sort = "original";
    for (const key of Object.keys(state.filters)) state.filters[key] = false;
    hideTip();
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
