/** Owned contextual UI. Only card heights are fitted to reserve the indicator block. */
(() => {
  "use strict";
  if (globalThis.__mercadoRadarContent) return;
  globalThis.__mercadoRadarContent = true;
  if (
    /^\/(captcha|jms|gz)\b/.test(location.pathname) ||
    location.hostname.startsWith("developers.")
  )
    return;
  const S = globalThis.RadarSelectors,
    M = globalThis.RadarPanelModel,
    A = globalThis.RadarProductAnalysis;
  if (!S || !M || !A) return;
  const owned = new Set(),
    cards = new Map(),
    selected = new Set(),
    watches = new Map();
  let lastKey = "",
    timer,
    dead = false,
    enabled = true,
    productSurface,
    productDetailSurface,
    searchSurface,
    productKey = "",
    searchKey = "";
  let sessionRevision = 0;
  const hostReset =
    "all:initial!important;font:13px/1.45 system-ui,-apple-system,sans-serif!important;color:#173c33!important;text-align:left!important;direction:ltr!important;";
  const brl = (n) =>
    n == null
      ? "Não informado"
      : Number(n).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
  const number = (n) => Number(n).toLocaleString("pt-BR");
  const css = `
    :host{color-scheme:light;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#173c33;text-align:left;direction:ltr;box-sizing:border-box}
    :host([hidden]),[hidden]{display:none!important}*{box-sizing:border-box}button,a{font:inherit;-webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:wait;opacity:.6}
    button:focus-visible,a:focus-visible{outline:3px solid #e9b744;outline-offset:3px}button{border:1px solid #cfdfd7;border-radius:9px;padding:9px 11px;background:#fff;color:#225846;font-size:12px;font-weight:650;line-height:1.35;min-height:36px}
    button:hover{background:#edf6f0}button.primary{background:#087f6b;border-color:#087f6b;color:#fff}button.primary:hover{background:#056753}button.link{border:0;background:none;padding:4px;min-height:28px;color:#587467;font-size:11px;font-weight:500}
    a{color:#246451;text-decoration:none}h2,p{margin:0}h2{font-size:14px;font-weight:700}p{font-size:11px;color:#647b70;line-height:1.5}small{font-size:10px;color:#668173}strong{font-weight:750}
    .surface{width:100%;min-width:0;border:1px solid #cddfd3;border-radius:12px;background:#fff;box-shadow:0 3px 10px #153c3308;overflow:hidden}
    .inner{padding:14px}.head{display:flex;gap:8px;align-items:center;justify-content:space-between}.brand{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:750;letter-spacing:-.25px}.mark{display:grid;place-items:center;flex:none;width:25px;height:25px;border-radius:8px;color:white;background:#087f6b;font-size:13px;font-weight:800}.tag{font-size:9px;letter-spacing:.4px;color:#52755f;background:#f0f6f0;border-radius:5px;padding:4px 6px;text-transform:uppercase;white-space:nowrap}
    .facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.fact{min-width:0}.fact small{display:block}.fact strong{display:block;font-size:18px;letter-spacing:-.4px;overflow-wrap:anywhere}.subline{margin-bottom:12px;font-size:11px;color:#60786a;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:7px}.actions button{flex:1;min-width:90px}.foot{border-top:1px solid #e5ede7;padding:9px 14px;background:#f8faf8;display:flex;justify-content:space-between;gap:8px;align-items:center}.foot p{font-size:10px;max-width:82%}.status{font-size:11px;margin-top:10px;color:#406a53;overflow-wrap:anywhere}.status.error{color:#9b4738}.status button{margin-top:7px;display:block}
    .toolbar .inner{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}.toolbar .copy{flex:1;min-width:150px}.toolbar h2{margin-top:6px}.toolbar p{margin-top:3px}.toolbar .actions{align-items:center}.toolbar .actions button{flex:0 0 auto;white-space:nowrap}.toolbar .foot p{max-width:none}
    .card-intel{margin:0;min-width:0}.intel-box{border:1px solid #e4e8e5;border-radius:7px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:8px 5px;gap:6px;background:#fff}.intel-cell{min-width:0;text-align:center}.intel-cell small{display:block;font-size:9px;color:#82918a;margin-top:3px}.intel-pill{display:inline-block;font-size:10px;line-height:1.3;padding:1px 7px;border-radius:4px;border:1px solid #e1e6e2;background:#f7f8f7;color:#718075;max-width:100%;overflow-wrap:anywhere}.intel-pill.excellent{color:#366a18;background:#ebf8d8;border-color:#cce1b8}.intel-pill.high{color:#25629c;background:#e9f2ff;border-color:#cbdcf7}.intel-pill.medium{color:#8b6c25;background:#fff6db;border-color:#eadfb9}.intel-number{display:block;font-size:12px;font-weight:650;color:#287d58;line-height:1.4;overflow-wrap:anywhere}.intel-number.unknown{display:inline-block;font-size:10px;font-weight:400;border:1px dashed #dce3dd;border-radius:5px;padding:1px 6px;color:#8c988f}.intel-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:5px;min-height:19px}.intel-foot small{font-size:9px;color:#94a198}.intel-foot label{display:flex;gap:5px;align-items:center;font-size:10px;color:#6c8173;cursor:pointer;white-space:nowrap}.intel-foot input{appearance:auto;accent-color:#087f6b;width:12px;height:12px;margin:0;cursor:pointer}.card-intel.selected .intel-box{border-color:#85b39a;background:#f5faf6}.card-intel.selected .intel-foot label{color:#08745e}.intel-meta{font-size:9px;color:#798d80;display:flex;justify-content:space-between;gap:6px;margin-bottom:4px}.intel-meta:empty{display:none}
    .launcher{position:relative;width:48px;height:48px}.launcher-button{width:48px;height:48px;min-height:48px;border:1px solid #ffffff80;border-radius:16px;background:#087f6b;color:white;font:800 16px system-ui;box-shadow:0 4px 20px #12382e30}.launcher-button:hover{background:#056450}.menu{position:absolute;right:0;bottom:60px;width:min(264px,calc(100vw - 32px));background:white;border:1px solid #d5e3d8;border-radius:14px;padding:8px;box-shadow:0 12px 42px #12382e26}.menu .brand{padding:8px 8px 12px;border-bottom:1px solid #e5ece6;margin-bottom:4px}.menu button,.menu a{width:100%;display:flex;align-items:center;gap:10px;min-height:40px;text-align:left;font-size:12px;color:#315647;background:transparent;border:0;border-radius:7px;padding:10px;margin:0;font-weight:500}.menu button:hover,.menu a:hover{background:#eef6f0}.menu .group{border-top:1px solid #e5ece6;margin-top:4px;padding-top:4px}.menu .key{font-size:15px;width:18px;color:#698270;text-align:center;flex:none}.menu .version{font-size:10px;color:#7b8d80;padding:8px 10px 3px}.notice{position:absolute;right:0;bottom:60px;width:250px;padding:12px;border:1px solid #d5e3d8;border-radius:12px;background:white;color:#315647;font-size:12px;box-shadow:0 4px 20px #12382e30}
    @media(max-width:340px){.inner{padding:11px}.fact strong{font-size:16px}.actions button{min-width:75px;padding:8px}.tag{font-size:8px}.toolbar .inner{gap:9px}}
  `;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    if (className === "key") node.setAttribute("aria-hidden", "true");
    return node;
  }
  function surface(kind, fixed = false) {
    const host = document.createElement("div");
    host.setAttribute("data-radar-owned", kind);
    host.style.cssText =
      hostReset +
      (fixed
        ? "position:fixed!important;z-index:20!important;display:block!important;contain:layout style!important;pointer-events:none!important;"
        : "display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;grid-column:1/-1!important;margin:12px 0!important;contain:inline-size style!important;");
    const root = host.attachShadow({ mode: "open" }),
      style = el("style");
    style.textContent = css;
    root.append(style);
    owned.add(host);
    return { host, root };
  }
  function remove(view) {
    if (view) {
      owned.delete(view.host);
      view.host.remove();
    }
  }
  function button(text, handler, className = "") {
    const node = el("button", text, className);
    node.type = "button";
    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
    return node;
  }
  function brand() {
    const node = el("div", null, "brand");
    node.append(el("span", "R", "mark"), el("span", "Mercado Radar"));
    return node;
  }
  function context() {
    const product = S.isProductPage() ? S.pageObservation() : null;
    const observations = product
      ? [product]
      : S.findCards().slice(0, 60).map(S.cardObservation).filter(Boolean);
    const items = [
      ...new Map(observations.map((item) => [item.id, item])).values(),
    ];
    return {
      url: location.href,
      page: product ? "product" : items.length ? "search" : "other",
      referenceId: product?.id || null,
      title: product?.title || S.extractQuery() || null,
      visiblePrice: product?.price ?? null,
      query: product ? null : S.extractQuery(),
      items,
      updatedAt: new Date().toISOString(),
    };
  }
  function showNotice(text) {
    launcherNotice.textContent = text;
    launcherNotice.hidden = !text;
  }
  function openPanel(tab = "summary", referenceId = null, selectedIds = []) {
    menu.hidden = true;
    launcherButton.setAttribute("aria-expanded", "false");
    // Open in the original user gesture; do not await a storage read first.
    chrome.runtime
      .sendMessage({ type: "RADAR_OPEN_PANEL", tab, referenceId, selectedIds })
      .then((r) =>
        showNotice(
          r?.ok
            ? ""
            : "Use o ícone Mercado Radar na barra do Chrome para abrir o painel.",
        ),
      )
      .catch(() => showNotice("Extensão atualizada. Recarregue esta página."));
    void publish(true);
  }
  async function monitor(obs, view) {
    const revision = sessionRevision;
    const action = view.root.querySelector(".watch"),
      status = view.root.querySelector(".status");
    if (!action || action.disabled) return;
    action.disabled = true;
    status.className = "status";
    status.textContent = "Salvando leitura…";
    try {
      const r = await chrome.runtime.sendMessage({
        type: "RADAR_FETCH",
        path: "/api/extension/watchlist",
        method: "POST",
        body: { itemId: obs.id, referenceId: obs.id, observation: obs },
      });
      if (revision !== sessionRevision) return;
      if (r?.ok) {
        watches.set(obs.id, r.body?.note || "Salvo no seu monitoramento.");
        action.textContent = "Monitorado ✓";
        status.textContent = watches.get(obs.id);
      } else {
        action.disabled = false;
        status.className = "status error";
        status.textContent =
          r?.status === 401
            ? "Entre na sua conta Radar para monitorar este anúncio."
            : r?.body?.error || "Não foi possível salvar. Tente novamente.";
        if (r?.status === 401)
          status.append(
            button("Conectar minha conta", () => openPanel("connection")),
          );
      }
    } catch {
      action.disabled = false;
      status.className = "status error";
      status.textContent =
        "Conexão interrompida. Recarregue a extensão e tente novamente.";
    }
  }
  const productAnalysis = A.createController({
    send: (message) => chrome.runtime.sendMessage(message),
    preferences: () =>
      chrome.storage.sync.get([
        "radarTaxPercent",
        "radarOperatingCost",
        "radarTargetMarginPercent",
        "radarTargetRoiPercent",
      ]),
    changed: (state) => {
      if (
        productSurface &&
        state.obs &&
        productSurface?.observation?.id === state.obs?.id &&
        productSurface?.observation?.price === state.obs?.price
      ) {
        productSurface.analysisView?.render(state);
        productDetailSurface?.analysisView?.render(state);
      }
    },
  });
  function renderProduct(obs) {
    const anchor = S.contextualProductAnchor();
    if (!enabled || !obs || !anchor) {
      remove(productSurface);
      remove(productDetailSurface);
      productSurface = null;
      productDetailSurface = null;
      productKey = "";
      return;
    }
    const key = JSON.stringify(obs);
    if (productSurface?.host.isConnected && key === productKey) return;
    remove(productSurface);
    remove(productDetailSurface);
    productDetailSurface = null;
    productKey = key;
    const view = (productSurface = surface("product")),
      card = el("section", null, "surface"),
      inner = el("div", null, "inner"),
      head = el("div", null, "head");
    view.observation = obs;
    head.append(brand(), el("span", "Análise automática", "tag"));
    inner.append(head);
    const largeAnchor = S.contextualProductAnalysisAnchor();
    if (largeAnchor) {
      const full = (productDetailSurface = surface("product-analysis")),
        fullCard = el("section", null, "surface"),
        fullBody = el("div", null, "inner");
      full.host.style.setProperty(
        "max-width",
        "min(1180px, calc(100% - 32px))",
        "important",
      );
      full.host.style.setProperty("margin", "16px auto", "important");
      fullCard.style.containerType = "inline-size";
      const fullHead = el("div", null, "head");
      fullHead.append(brand(), el("span", "Análise do produto", "tag"));
      fullBody.append(fullHead);
      full.analysisView = A.mount(fullBody, productAnalysis, {
        connect: () => openPanel("connection"),
        advanced: () => openPanel("calculator", obs.id),
      });
      fullCard.append(fullBody);
      full.root.append(fullCard);
      largeAnchor.element.insertAdjacentElement(
        largeAnchor.position,
        full.host,
      );
      view.analysisView = A.mountSummary(inner, productAnalysis, {
        adjust: () => {
          full.host.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      });
    } else
      view.analysisView = A.mount(inner, productAnalysis, {
        connect: () => openPanel("connection"),
        advanced: () => openPanel("calculator", obs.id),
      });
    const watch = button(
      watches.has(obs.id) ? "Monitorado ✓" : "Monitorar preço",
      () => void monitor(obs, view),
      "watch",
    );
    watch.disabled = watches.has(obs.id);
    const actions = el("div", null, "actions");
    actions.style.marginTop = "10px";
    actions.append(watch);
    const status = el("p", watches.get(obs.id) || "", "status");
    status.setAttribute("role", "status");
    inner.append(actions, status);
    const foot = el("div", null, "foot");
    foot.append(
      el("p", "Leitura pública e dados autorizados da sua conta."),
      button("Ocultar", () => void setEnabled(false), "link"),
    );
    card.append(inner, foot);
    view.root.append(card);
    anchor.element.insertAdjacentElement(anchor.position, view.host);
    if (
      productAnalysis.state.obs?.id === obs.id &&
      productAnalysis.state.obs?.price === obs.price
    ) {
      view.analysisView.render(productAnalysis.state);
      productDetailSurface?.analysisView?.render(productAnalysis.state);
    }
  }
  function renderSearch(value) {
    const anchor = S.contextualSearchAnchor();
    if (!enabled || value.page !== "search" || !anchor) {
      remove(searchSurface);
      searchSurface = null;
      searchKey = "";
      return;
    }
    const key = JSON.stringify([
      value.query,
      value.items.map((i) => [i.id, i.price]),
      [...selected],
    ]);
    if (searchSurface?.host.isConnected && searchKey === key) return;
    remove(searchSurface);
    searchKey = key;
    const view = (searchSurface = surface("search")),
      box = el("section", null, "surface toolbar"),
      inner = el("div", null, "inner"),
      copy = el("div", null, "copy");
    copy.append(
      brand(),
      el("h2", value.items.length + " anúncios para analisar"),
      el(
        "p",
        "Marque Comparar nos anúncios equivalentes para conferir a faixa de preços.",
      ),
    );
    const actions = el("div", null, "actions");
    actions.append(
      button("Ver pesquisa ↗", () => openPanel("market")),
      button(
        "Comparar" + (selected.size ? " (" + selected.size + ")" : ""),
        () => openPanel("market", null, [...selected]),
        "primary",
      ),
    );
    inner.append(copy, actions);
    box.append(inner);
    if (selected.size) {
      const foot = el("div", null, "foot"),
        sample = M.sample(
          value.items.filter((i) => selected.has(i.id)).map((i) => i.price),
          null,
        );
      foot.append(
        el(
          "p",
          sample
            ? selected.size +
                " selecionados · mediana " +
                brl(sample.median) +
                " · somente esta amostra"
            : selected.size +
                " selecionados · marque pelo menos 3 equivalentes para ver a faixa.",
        ),
        button(
          "Limpar",
          () => {
            selected.clear();
            refreshUi(context());
          },
          "link",
        ),
      );
      box.append(foot);
    }
    view.root.append(box);
    anchor.element.insertAdjacentElement(anchor.position, view.host);
  }
  const fitted = new Map();
  let cardStyle;
  const searchAnalysis = {
    key: "",
    generation: 0,
    insights: new Map(),
    status: "idle",
  };
  function fit(node, attribute) {
    if (!node) return;
    let entry = fitted.get(node);
    if (!entry) {
      entry = { count: 0, attribute, previous: node.getAttribute(attribute) };
      fitted.set(node, entry);
    }
    entry.count++;
    node.setAttribute(attribute, "");
  }
  function releaseCard(view) {
    for (const node of view?.fits || []) {
      const entry = fitted.get(node);
      if (!entry) continue;
      if (--entry.count > 0) continue;
      if (entry.previous == null) node.removeAttribute(entry.attribute);
      else node.setAttribute(entry.attribute, entry.previous);
      fitted.delete(node);
    }
    remove(view);
  }
  function ensureCardStyle() {
    if (cardStyle?.isConnected) return;
    cardStyle = el("style");
    cardStyle.setAttribute("data-radar-owned", "card-layout");
    cardStyle.textContent =
      "[data-radar-card-fit]{height:auto!important;max-height:none!important}.ui-search-layout__item[data-radar-card-fit]>.poly-card[data-radar-card-fit]{height:100%!important}[data-radar-grid-fit]{height:auto!important;max-height:none!important;grid-auto-rows:auto!important;grid-template-rows:none!important}";
    document.head.append(cardStyle);
    owned.add(cardStyle);
  }
  function resetSearchAnalysis() {
    searchAnalysis.generation++;
    searchAnalysis.key = "";
    searchAnalysis.insights.clear();
    searchAnalysis.status = "idle";
  }
  async function loadSearchAnalysis(value) {
    if (!enabled || value.page !== "search") {
      if (searchAnalysis.key) resetSearchAnalysis();
      return;
    }
    const key = JSON.stringify([value.url, value.items]);
    if (searchAnalysis.key === key) return;
    const revision = ++searchAnalysis.generation;
    searchAnalysis.key = key;
    searchAnalysis.insights.clear();
    searchAnalysis.status = "loading";
    renderCards(value);
    try {
      const auth = await chrome.runtime.sendMessage({
        type: "RADAR_AUTH_STATUS",
      });
      if (revision !== searchAnalysis.generation) return;
      if (!auth?.authenticated || auth.extensionProtocol !== 2) {
        searchAnalysis.status = "local";
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: "RADAR_FETCH",
        path: "/api/extension/observations",
        method: "POST",
        body: { page: "search", query: value.query, items: value.items },
      });
      if (revision !== searchAnalysis.generation) return;
      const ids = new Set(value.items.map((i) => i.id));
      searchAnalysis.insights = new Map(
        (response?.ok ? response.body?.items || [] : [])
          .filter((item) => ids.has(item.id))
          .map((item) => [item.id, item]),
      );
      searchAnalysis.status = response?.ok ? "ready" : "local";
    } catch {
      if (revision === searchAnalysis.generation)
        searchAnalysis.status = "local";
    }
    if (revision === searchAnalysis.generation && !dead) renderCards(context());
  }
  function renderCards(value) {
    const currentCards = new Set(
      enabled && value.page === "search" ? S.findCards().slice(0, 60) : [],
    );
    for (const [card, view] of cards)
      if (!currentCards.has(card) || !view.host.isConnected) {
        releaseCard(view);
        cards.delete(card);
      }
    if (currentCards.size) ensureCardStyle();
    for (const card of currentCards) {
      const obs = S.cardObservation(card, 0),
        anchor = S.contextualCardAnchor(card);
      let view = cards.get(card);
      if (!obs || !anchor) {
        if (view) {
          releaseCard(view);
          cards.delete(card);
        }
        continue;
      }
      if (view?.id !== obs.id) {
        if (view) releaseCard(view);
        // ML may clone a card during pagination. Discard a cloned owned footer before mounting.
        for (const copy of card.querySelectorAll('[data-radar-owned="card"]'))
          copy.remove();
        for (const node of anchor.resize)
          if (!fitted.has(node)) node.removeAttribute("data-radar-card-fit");
        view = surface("card");
        view.id = obs.id;
        view.host.style.setProperty("margin", "8px 0 6px", "important");
        const box = el("section", null, "card-intel"),
          metrics = el("div", null, "intel-box"),
          left = el("div", null, "intel-cell"),
          right = el("div", null, "intel-cell"),
          pill = el("span", "Sem período", "intel-pill"),
          amount = el("span", "Sem dados", "intel-number unknown"),
          amountLabel = el("small", "vendas"),
          meta = el("div", null, "intel-meta");
        left.append(pill, el("small", "demanda"));
        right.append(amount, amountLabel);
        metrics.append(left, right);
        const foot = el("div", null, "intel-foot"),
          label = el("label"),
          choose = el("input");
        choose.type = "checkbox";
        choose.className = "choose";
        label.append(choose, document.createTextNode("Comparar"));
        label.addEventListener("click", (event) => event.stopPropagation());
        choose.addEventListener("change", (event) => {
          event.stopPropagation();
          if (choose.checked) selected.add(view.id);
          else selected.delete(view.id);
          refreshUi(context());
        });
        foot.append(el("small", "Radar"), label);
        box.append(meta, metrics, foot);
        view.root.append(box);
        view.nodes = { box, pill, amount, amountLabel, choose, meta };
        view.fits = [...anchor.resize, ...(anchor.grid ? [anchor.grid] : [])];
        for (const node of anchor.resize) fit(node, "data-radar-card-fit");
        if (anchor.grid) fit(anchor.grid, "data-radar-grid-fit");
        anchor.element.insertAdjacentElement(anchor.position, view.host);
        cards.set(card, view);
      }
      const insight = searchAnalysis.insights.get(obs.id),
        d = A.demand(insight),
        n = view.nodes;
      n.pill.textContent =
        {
          EXCELENTE: "Excelente",
          ALTA: "Alta",
          MEDIA: "Média",
          BAIXA: "Baixa",
        }[d.level] || "Sem período";
      n.pill.className =
        "intel-pill" +
        ({ EXCELENTE: " excellent", ALTA: " high", MEDIA: " medium" }[
          d.level
        ] || "");
      n.pill.title = d.basis;
      const revenue = insight?.estimate?.revenuePerDay?.value;
      if (
        d.rate != null &&
        insight.estimate.method !== "VIDA" &&
        insight.price === obs.price &&
        typeof revenue === "number" &&
        Number.isFinite(revenue) &&
        revenue >= 0
      ) {
        n.amount.textContent = brl(revenue);
        n.amountLabel.textContent = "receita est./dia";
        n.amount.className = "intel-number";
        n.amount.title =
          d.basis +
          " Ritmo medido × preço atual. Estimativa bruta; não é faturamento recebido.";
      } else if (d.rate != null) {
        n.amount.textContent = number(d.rate) + " un./dia";
        n.amountLabel.textContent =
          insight.estimate.method === "VIDA"
            ? "média histórica"
            : "ritmo medido";
        n.amount.className = "intel-number";
        n.amount.title = d.basis;
      } else {
        n.amount.textContent =
          obs.soldLabel?.replace(/\s*vendidos?\b/i, "").trim() ||
          (obs.soldLower == null
            ? "Sem dados"
            : (obs.soldHasPlus ? "+" : "") + number(obs.soldLower));
        n.amountLabel.textContent =
          obs.soldLower == null ? "vendas por período" : "vendidos no total";
        n.amount.className =
          "intel-number" + (obs.soldLower == null ? " unknown" : "");
        n.amount.title = "O acumulado não informa ritmo nem faturamento.";
      }
      n.meta.replaceChildren();
      if (obs.catalogProductId || obs.referenceKind === "CATALOG")
        n.meta.append(el("span", "Catálogo"));
      const age = insight?.estimate?.ageDays;
      if (
        age?.source === "API" &&
        typeof age.value === "number" &&
        Number.isFinite(age.value) &&
        age.value >= 0
      ) {
        const text = el("span", number(Math.floor(age.value)) + " dias");
        text.title = "Idade desde a criação informada pela API";
        n.meta.append(text);
      }
      const consistent =
        value.items.find((item) => item.id === obs.id)?.price === obs.price;
      n.choose.disabled = !(Number(obs.price) > 0) || !consistent;
      n.choose.title = !consistent
        ? "Ofertas com preços diferentes para esta referência. Abra o anúncio para conferir."
        : n.choose.disabled
          ? "Confira o preço no anúncio antes de comparar."
          : "Incluir na comparação da barra do Radar";
      n.choose.setAttribute(
        "aria-label",
        "Selecionar para comparar: " + obs.title,
      );
      n.choose.checked = selected.has(obs.id);
      n.box.classList.toggle("selected", n.choose.checked);
    }
    if (!cards.size && cardStyle) {
      owned.delete(cardStyle);
      cardStyle.remove();
      cardStyle = null;
    }
  }
  function refreshUi(value) {
    const ids = new Set(
      value.items.filter((i) => Number(i.price) > 0).map((i) => i.id),
    );
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    renderProduct(value.page === "product" ? value.items[0] : null);
    if (enabled && value.page === "product" && productSurface)
      void productAnalysis.load(value.items[0]);
    else productAnalysis.clear();
    renderSearch(value);
    renderCards(value);
    void loadSearchAnalysis(value);
    visibilityButton.textContent = enabled
      ? "Ocultar análise na página"
      : "Mostrar análise na página";
  }
  async function setEnabled(value) {
    enabled = value;
    menu.hidden = true;
    launcherButton.setAttribute("aria-expanded", "false");
    refreshUi(context());
    await chrome.storage.sync
      .set({ radarInlineEnabled: value })
      .catch(() => {});
  }
  async function publish(force = false) {
    if (dead) return;
    const value = context();
    refreshUi(value);
    const key = JSON.stringify({ ...value, updatedAt: null });
    if (!force && key === lastKey) return;
    lastKey = key;
    try {
      await chrome.runtime.sendMessage({
        type: "RADAR_CONTEXT_UPDATE",
        context: value,
      });
    } catch {
      dead = true;
      observer.disconnect();
      resetSearchAnalysis();
      for (const view of cards.values()) releaseCard(view);
      cards.clear();
      for (const host of owned) host.remove();
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "RADAR_READ_CONTEXT") {
      respond(context());
      return false;
    }
  });
  const launcher = surface("launcher", true);
  launcher.host.style.cssText =
    hostReset +
    "position:fixed!important;right:20px!important;bottom:24px!important;z-index:2147483000!important;width:48px!important;height:48px!important;display:block!important;contain:layout style!important;";
  const launcherBox = el("div", null, "launcher"),
    menu = el("nav", null, "menu");
  menu.id = "radar-menu";
  menu.hidden = true;
  menu.setAttribute("aria-label", "Ferramentas do Mercado Radar");
  const launcherButton = button(
    "R",
    () => {
      menu.hidden = !menu.hidden;
      launcherNotice.hidden = true;
      launcherButton.setAttribute("aria-expanded", String(!menu.hidden));
    },
    "launcher-button",
  );
  launcherButton.title = "Menu Mercado Radar";
  launcherButton.setAttribute("aria-label", "Abrir menu do Mercado Radar");
  launcherButton.setAttribute("aria-expanded", "false");
  launcherButton.setAttribute("aria-controls", menu.id);
  menu.append(brand());
  for (const [name, tab, icon] of [
    ["Análise da página", "summary", "◎"],
    ["Calculadora de lucro", "calculator", "▦"],
    ["Pesquisa e comparação", "market", "≋"],
  ]) {
    const action = button("", () =>
      openPanel(tab, null, tab === "market" ? [...selected] : []),
    );
    action.append(el("span", icon, "key"), document.createTextNode(name));
    menu.append(action);
  }
  const links = el("div", null, "group");
  for (const [name, path, icon] of [
    ["Meus monitoramentos", "/monitoramento", "◷"],
    ["Painel do Radar", "/", "↗"],
  ]) {
    const link = el("a");
    link.href = "https://radar.optarys.com.br" + path;
    link.target = "_blank";
    link.rel = "noopener";
    link.dataset.path = path;
    link.append(el("span", icon, "key"), document.createTextNode(name));
    links.append(link);
  }
  const settings = button("", () => openPanel("connection"));
  settings.append(
    el("span", "⚙", "key"),
    document.createTextNode("Conta e configurações"),
  );
  links.append(settings);
  const visibilityButton = button(
    "Ocultar análise na página",
    () => void setEnabled(!enabled),
    "link",
  );
  menu.append(
    links,
    visibilityButton,
    el("div", "Mercado Radar · 0.10.0", "version"),
  );
  const launcherNotice = el("div", "", "notice");
  launcherNotice.hidden = true;
  launcherNotice.setAttribute("role", "status");
  launcherBox.append(menu, launcherButton, launcherNotice);
  launcher.root.append(launcherBox);
  document.body.append(launcher.host);
  document.addEventListener("pointerdown", (event) => {
    if (!event.composedPath().includes(launcher.host)) {
      menu.hidden = true;
      launcherButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      menu.hidden = true;
      launcherButton.setAttribute("aria-expanded", "false");
      launcherButton.focus();
    }
  });
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void publish(), 500);
  }
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          !r.target.closest?.("[data-radar-owned]") &&
          (r.type === "characterData" ||
            ![...r.addedNodes, ...r.removedNodes].every(
              (n) => n.nodeType === 1 && n.hasAttribute("data-radar-owned"),
            )),
      )
    )
      schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  addEventListener("popstate", schedule);
  addEventListener("hashchange", schedule);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void publish(true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.radarPreferencesWorkspace) {
      productAnalysis.clear();
      resetSearchAnalysis();
      refreshUi(context());
    } else if (
      area === "sync" &&
      [
        "radarTaxPercent",
        "radarOperatingCost",
        "radarTargetMarginPercent",
        "radarTargetRoiPercent",
      ].some((k) => changes[k]) &&
      productAnalysis.state.auth?.authenticated
    )
      productAnalysis.refresh();
    if (area === "local" && changes.radarAccessToken) {
      sessionRevision++;
      resetSearchAnalysis();
      productAnalysis.clear();
      watches.clear();
      productKey = "";
      refreshUi(context());
    }
    if (area === "sync" && changes.radarInlineEnabled) {
      enabled = changes.radarInlineEnabled.newValue !== false;
      refreshUi(context());
    }
  });
  (async () => {
    const p = await chrome.storage.sync
      .get(["radarInlineEnabled", "radarApiBase"])
      .catch(() => ({}));
    enabled = p.radarInlineEnabled !== false;
    try {
      const base = new URL(p.radarApiBase || "https://radar.optarys.com.br");
      if (
        base.origin === "https://radar.optarys.com.br" ||
        (base.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(base.hostname))
      )
        for (const link of links.querySelectorAll("a"))
          link.href = base.origin + link.dataset.path;
    } catch {
      /* Production links remain valid. */
    }
    await publish();
  })();
})();
