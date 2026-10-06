const state = {
  lastUrl: location.href,
  running: false,
};

function getItemIdFromElement(element) {
  const href =
    element.querySelector("a[href*='/MLB']")?.href ||
    element.closest("a[href*='/MLB']")?.href ||
    "";

  const match = href.match(/MLB-?(\d+)/i) || href.match(/MLB(\d+)/i);
  return match ? "MLB" + match[1] : null;
}

function findSearchCards() {
  return [
    ...document.querySelectorAll(
      "li.ui-search-layout__item, .ui-search-result, .poly-card, .andes-card",
    ),
  ].filter((element) => getItemIdFromElement(element));
}

function ensureBadge(card, item) {
  if (card.querySelector(".mercado-radar-card")) return;

  const box = document.createElement("div");
  box.className = "mercado-radar-card";
  box.innerHTML = [
    '<div class="mercado-radar-card__row">',
    '<strong>Mercado Radar</strong>',
    '<span class="mercado-radar-card__score">' +
      item.intelligence.score +
      "/100</span>",
    "</div>",
    '<div class="mercado-radar-card__row">',
    "<span>Demanda</span>",
    "<span>" + item.intelligence.demandLabel + "</span>",
    "</div>",
    item.intelligence.salesPerMonth == null
      ? ""
      : '<div class="mercado-radar-card__row"><span>Vendas/mês</span><span>~' +
        item.intelligence.salesPerMonth +
        "</span></div>",
    item.intelligence.ageDays == null
      ? ""
      : '<div class="mercado-radar-card__row"><span>Idade</span><span>' +
        item.intelligence.ageDays +
        " dias</span></div>",
  ].join("");

  card.appendChild(box);
}

async function enrichSearch() {
  if (state.running) return;
  state.running = true;

  try {
    const cards = findSearchCards();
    if (!cards.length) return;

    const cardMap = new Map();
    for (const card of cards) {
      const id = getItemIdFromElement(card);
      if (id) cardMap.set(id, card);
    }

    const ids = [...cardMap.keys()].slice(0, 50);
    if (!ids.length) return;

    const response = await chrome.runtime.sendMessage({
      type: "RADAR_FETCH",
      path: "/api/extension/items?ids=" + encodeURIComponent(ids.join(",")),
    });

    if (!response?.ok || !response.body?.items) return;

    for (const item of response.body.items) {
      const card = cardMap.get(item.id);
      if (card) ensureBadge(card, item);
    }
  } finally {
    state.running = false;
  }
}

const observer = new MutationObserver(() => {
  if (location.href !== state.lastUrl) {
    state.lastUrl = location.href;
  }
  clearTimeout(window.__mercadoRadarTimer);
  window.__mercadoRadarTimer = setTimeout(enrichSearch, 500);
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

enrichSearch();
