/** v0.7: read-only page adapter. No cards, columns, body styles, filters or sorting. */
(() => {
  "use strict";
  if (globalThis.__mercadoRadarContent) return;
  globalThis.__mercadoRadarContent = true;
  if (
    /^\/(captcha|jms|gz)\b/.test(location.pathname) ||
    location.hostname.startsWith("developers.")
  )
    return;
  const S = globalThis.RadarSelectors;
  if (!S) return;
  let lastKey = "",
    timer,
    dead = false;
  function context() {
    const product = S.isProductPage() ? S.pageObservation() : null;
    const items = product
      ? [product]
      : S.findCards().slice(0, 60).map(S.cardObservation).filter(Boolean);
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
  async function publish(force = false) {
    if (dead) return;
    const value = context();
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
      host?.remove();
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "RADAR_READ_CONTEXT") {
      respond(context());
      return false;
    }
  });
  const host = document.createElement("div");
  host.setAttribute("data-radar-owned", "launcher");
  host.style.cssText =
    "all:initial!important;position:fixed!important;right:20px!important;bottom:24px!important;z-index:2147483000!important;width:48px!important;height:48px!important;display:block!important;contain:layout style!important;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ":host{color-scheme:light}button{all:initial;box-sizing:border-box;width:48px;height:48px;display:grid;place-items:center;border:1px solid #ffffff80;border-radius:16px;background:#087f6b;color:white;font:800 16px system-ui;cursor:pointer;box-shadow:0 4px 20px #12382e30}button:hover{background:#056450}button:focus-visible{outline:3px solid #f2ba48;outline-offset:3px}span{display:none;position:absolute;right:56px;bottom:0;width:210px;padding:12px;border-radius:12px;background:white;color:#183b34;font:13px/1.45 system-ui;box-shadow:0 2px 20px #12382e30}span.visible{display:block}";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "R";
  button.title = "Abrir Mercado Radar";
  button.setAttribute("aria-label", "Abrir Mercado Radar no painel lateral");
  const notice = document.createElement("span");
  notice.setAttribute("role", "status");
  button.addEventListener("click", () => {
    // Keep the opening request in the click's user gesture; don't await context first.
    chrome.runtime
      .sendMessage({ type: "RADAR_OPEN_PANEL" })
      .then((result) => {
        if (!result?.ok) {
          notice.textContent =
            "Clique no ícone Mercado Radar na barra do Chrome para abrir o painel.";
          notice.className = "visible";
        } else notice.className = "";
      })
      .catch(() => {
        notice.textContent = "Extensão atualizada. Recarregue esta página.";
        notice.className = "visible";
      });
    void publish(true);
  });
  shadow.append(style, button, notice);
  document.body.append(host);
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void publish(), 500);
  }
  const observer = new MutationObserver((records) => {
    if (records.some((r) => !host.contains(r.target) && r.target !== host))
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
  void publish();
})();
