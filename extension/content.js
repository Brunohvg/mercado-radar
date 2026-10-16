/** Contextual UI in owned Shadow DOM. Never restyle, hide or reorder ML elements. */
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
    frame,
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
    .strip{display:flex;gap:3px;pointer-events:auto;width:100%;height:30px;filter:drop-shadow(0 2px 5px #143b2b12)}.strip button{min-height:30px;padding:5px 8px;border-color:#c7d9cc;font-size:11px;border-radius:7px;background:#fffffff5;color:#17553f;white-space:nowrap}.strip .analyze{flex:1;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis}.strip .choose{flex:none;display:grid;place-items:center;width:30px;padding:4px;font-size:16px}.strip .choose[aria-pressed=true]{background:#087f6b;color:#fff;border-color:#087f6b}.strip .r{display:inline-grid;place-items:center;width:16px;height:16px;margin-right:4px;background:#087f6b;color:#fff;border-radius:5px;font-size:9px}
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
        "Use os atalhos nas fotos. Marque produtos equivalentes com + para comparar.",
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
  function renderCards(value) {
    const currentCards = new Set(
      enabled && value.page === "search" ? S.findCards().slice(0, 60) : [],
    );
    for (const [card, view] of cards)
      if (!currentCards.has(card)) {
        remove(view);
        cards.delete(card);
        resizeObserver.unobserve(card);
        if (view.media) resizeObserver.unobserve(view.media);
      }
    for (const card of currentCards) {
      const obs = S.cardObservation(card, 0),
        media = S.cardMediaAnchor(card);
      if (!obs || !media) continue;
      let view = cards.get(card);
      if (view?.id !== obs.id || !view.host.isConnected) {
        if (view) remove(view);
        view = surface("card", true);
        view.id = obs.id;
        const strip = el("div", null, "strip"),
          analyze = button(
            "",
            () => openPanel("calculator", view.id),
            "analyze",
          );
        analyze.append(
          el("span", "R", "r"),
          document.createTextNode("Analisar"),
        );
        analyze.setAttribute("aria-label", "Calcular lucro de " + obs.title);
        analyze.title = "Abrir análise e calculadora deste produto";
        const choose = button(
          "+",
          () => {
            if (selected.has(view.id)) selected.delete(view.id);
            else selected.add(view.id);
            refreshUi(context());
          },
          "choose",
        );
        choose.setAttribute(
          "aria-label",
          "Selecionar para comparar: " + obs.title,
        );
        strip.append(analyze, choose);
        view.root.append(strip);
        document.body.append(view.host);
        cards.set(card, view);
        resizeObserver.observe(card);
      }
      if (view.media && view.media !== media)
        resizeObserver.unobserve(view.media);
      view.media = media;
      resizeObserver.observe(media);
      const consistent =
        value.items.find((i) => i.id === obs.id)?.price === obs.price;
      const analyze = view.root.querySelector(".analyze");
      analyze.disabled = !consistent;
      analyze.title = consistent
        ? "Abrir análise e calculadora deste produto"
        : "Este produto tem preços diferentes nos cards. Abra o anúncio para conferir a oferta.";
      analyze.setAttribute("aria-label", "Calcular lucro de " + obs.title);
      const choose = view.root.querySelector(".choose");
      choose.disabled = !(Number(obs.price) > 0) || !consistent;
      choose.title = !consistent
        ? analyze.title
        : choose.disabled
          ? "Preço não reconhecido. Abra o anúncio para conferir."
          : "Selecionar este anúncio para comparação";
      choose.setAttribute(
        "aria-label",
        "Selecionar para comparar: " + obs.title,
      );
      choose.textContent = selected.has(obs.id) ? "✓" : "+";
      choose.setAttribute("aria-pressed", String(selected.has(obs.id)));
    }
    positionCards();
  }
  function positionCards() {
    for (const view of cards.values()) {
      const r = view.media.getBoundingClientRect(),
        visible =
          r.width >= 110 &&
          r.height >= 60 &&
          r.bottom > 32 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth;
      view.host.hidden = !visible;
      if (!visible) continue;
      for (const [key, value] of [
        ["left", Math.max(4, r.left + 7)],
        ["top", r.bottom - 37],
        ["width", Math.min(154, r.width - 14)],
        ["height", 30],
      ])
        view.host.style.setProperty(key, value + "px", "important");
    }
  }
  function schedulePosition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(positionCards);
  }
  const resizeObserver = new ResizeObserver(schedulePosition);
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
      resizeObserver.disconnect();
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
    el("div", "Mercado Radar · 0.9.0", "version"),
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
  addEventListener("scroll", schedulePosition, {
    passive: true,
    capture: true,
  });
  addEventListener("resize", schedulePosition);
  addEventListener("popstate", schedule);
  addEventListener("hashchange", schedule);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void publish(true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.radarPreferencesWorkspace) {
      productAnalysis.clear();
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
