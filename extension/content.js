const state = {
  lastUrl: location.href,
  running: false,
  items: [],
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function getReferenceFromHref(href) {
  const match = String(href || "").match(/MLB(U)?-?(\d+)/i);
  if (!match) return null;
  return "MLB" + (match[1] ? "U" : "") + match[2];
}

function getCurrentReference() {
  return getReferenceFromHref(location.href);
}

function getCardReference(card) {
  const links = [...card.querySelectorAll("a[href*='MLB']")];
  for (const link of links) {
    const id = getReferenceFromHref(link.href);
    if (id) return id;
  }
  return null;
}

function getCardTitle(card) {
  const element =
    card.querySelector(".poly-component__title") ||
    card.querySelector(".ui-search-item__title") ||
    card.querySelector("h2") ||
    card.querySelector("a[title]");
  return (element?.textContent || element?.getAttribute("title") || "").trim();
}

function parseMoneyAmount(container) {
  if (!container) return null;
  const fraction = container.querySelector(".andes-money-amount__fraction");
  const cents = container.querySelector(".andes-money-amount__cents");
  if (!fraction) return null;

  const integer = Number((fraction.textContent || "").replace(/\D/g, ""));
  const decimal = cents
    ? Number((cents.textContent || "").replace(/\D/g, "").slice(0, 2).padEnd(2, "0")) / 100
    : 0;

  const value = integer + decimal;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getCardPrice(card) {
  const preferred =
    card.querySelector(".poly-price__current") ||
    card.querySelector(".ui-search-price__second-line") ||
    card.querySelector(".ui-search-price") ||
    card;
  return parseMoneyAmount(preferred);
}

function getPagePrice() {
  const containers = [
    document.querySelector(".ui-pdp-price__second-line"),
    document.querySelector(".ui-pdp-price"),
    document.querySelector("[data-testid='price-part']"),
  ].filter(Boolean);

  for (const container of containers) {
    const value = parseMoneyAmount(container);
    if (value) return value;
  }
  return null;
}

function findSearchCards() {
  const candidates = [
    ...document.querySelectorAll(
      "li.ui-search-layout__item, .ui-search-result, .poly-card",
    ),
  ];

  return candidates.filter((card, index, all) => {
    if (!getCardTitle(card)) return false;
    return !all.some(
      (other, otherIndex) =>
        otherIndex < index && other.contains(card),
    );
  });
}

function extractSearchQuery() {
  const searchInput =
    document.querySelector("#cb1-edit") ||
    document.querySelector("input[name='as_word']") ||
    document.querySelector("input.nav-search-input");

  const inputValue = searchInput?.value?.trim();
  if (inputValue && inputValue.length >= 2) return inputValue;

  const query = new URL(location.href).searchParams.get("q");
  if (query && query.trim().length >= 2) return query.trim();

  return null;
}

function titleScore(a, b) {
  const left = new Set(normalize(a).split(" ").filter((token) => token.length > 1));
  const right = new Set(normalize(b).split(" ").filter((token) => token.length > 1));
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  return intersection / Math.max(left.size, right.size);
}

function matchItems(cards, items) {
  const remaining = new Set(items.map((_, index) => index));
  const matches = [];

  cards.forEach((card) => {
    const cardTitle = getCardTitle(card);
    const cardPrice = getCardPrice(card);
    const directRef = getCardReference(card);

    let bestIndex = -1;
    let bestScore = -1;

    items.forEach((item, index) => {
      if (!remaining.has(index)) return;

      let score = titleScore(cardTitle, item.title);
      if (directRef === item.id || directRef === item.userProductId) score += 2;

      if (cardPrice && item.price) {
        const priceGap = Math.abs(cardPrice - item.price) / Math.max(cardPrice, item.price);
        score += Math.max(0, 0.45 - priceGap);
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
  });

  return matches;
}

function ensureBadge(card, item, visiblePrice) {
  const existing = card.querySelector(".mercado-radar-card");
  const price = visiblePrice || item.price || 0;
  const salesPerMonth = item.intelligence?.salesPerMonth;
  const revenuePerMonth =
    salesPerMonth == null || !price ? null : salesPerMonth * price;

  card.dataset.radarScore = String(item.intelligence?.score ?? 0);
  card.dataset.radarDemand = item.intelligence?.demandLabel || "BAIXA";
  card.dataset.radarSales = String(salesPerMonth ?? 0);
  card.dataset.radarRevenue = String(revenuePerMonth ?? 0);
  card.dataset.radarAge = String(item.intelligence?.ageDays ?? 999999);
  card.dataset.radarFreeShipping = item.freeShipping ? "1" : "0";
  card.dataset.radarItemId = item.id;

  const html = [
    '<div class="mercado-radar-card__row mercado-radar-card__header">',
    '<strong>Mercado Radar</strong>',
    '<span class="mercado-radar-card__score">' +
      (item.intelligence?.score ?? 0) +
      "/100</span>",
    "</div>",
    '<div class="mercado-radar-card__row"><span>Demanda</span><b>' +
      (item.intelligence?.demandLabel || "—") +
      "</b></div>",
    salesPerMonth == null
      ? ""
      : '<div class="mercado-radar-card__row"><span>Vendas/mês</span><b>~' +
        Math.round(salesPerMonth) +
        "</b></div>",
    revenuePerMonth == null
      ? ""
      : '<div class="mercado-radar-card__row"><span>Faturamento/mês</span><b>' +
        money(revenuePerMonth) +
        "</b></div>",
    item.intelligence?.ageDays == null
      ? ""
      : '<div class="mercado-radar-card__row"><span>Idade</span><span>' +
        item.intelligence.ageDays +
        " dias</span></div>",
  ].join("");

  if (existing) {
    existing.innerHTML = html;
    return;
  }

  const box = document.createElement("div");
  box.className = "mercado-radar-card";
  box.innerHTML = html;
  card.appendChild(box);
}

function filterMarkup() {
  return `
    <div class="mercado-radar-filters__title">
      <span>Radar</span>
      <button type="button" data-radar-reset>Limpar</button>
    </div>
    <label>Oportunidade
      <select data-radar-filter="score">
        <option value="0">Todas</option>
        <option value="50">Score 50+</option>
        <option value="65">Score 65+</option>
        <option value="80">Score 80+</option>
      </select>
    </label>
    <label>Demanda
      <select data-radar-filter="demand">
        <option value="">Todas</option>
        <option value="EXCELENTE">Excelente</option>
        <option value="ALTA">Alta</option>
        <option value="MEDIA">Média</option>
        <option value="BAIXA">Baixa</option>
      </select>
    </label>
    <label>Vendas estimadas/mês
      <select data-radar-filter="sales">
        <option value="0">Todas</option>
        <option value="10">10+</option>
        <option value="50">50+</option>
        <option value="100">100+</option>
        <option value="300">300+</option>
      </select>
    </label>
    <label>Faturamento estimado
      <select data-radar-filter="revenue">
        <option value="0">Todos</option>
        <option value="1000">R$ 1 mil+</option>
        <option value="5000">R$ 5 mil+</option>
        <option value="10000">R$ 10 mil+</option>
        <option value="50000">R$ 50 mil+</option>
      </select>
    </label>
    <label>Idade máxima
      <select data-radar-filter="age">
        <option value="999999">Qualquer</option>
        <option value="30">30 dias</option>
        <option value="90">90 dias</option>
        <option value="365">1 ano</option>
      </select>
    </label>
    <label class="mercado-radar-filters__check">
      <input type="checkbox" data-radar-filter="freeShipping" />
      Só frete grátis
    </label>
    <label>Ordenar
      <select data-radar-filter="sort">
        <option value="original">Mercado Livre</option>
        <option value="score">Melhor oportunidade</option>
        <option value="sales">Mais vendidos</option>
        <option value="revenue">Maior faturamento</option>
        <option value="newest">Mais novos</option>
      </select>
    </label>
  `;
}

function applyFilters() {
  const panel = document.getElementById("mercado-radar-filters");
  if (!panel) return;

  const cards = findSearchCards();
  const value = (name) => panel.querySelector(`[data-radar-filter="${name}"]`);

  const score = Number(value("score")?.value || 0);
  const demand = value("demand")?.value || "";
  const sales = Number(value("sales")?.value || 0);
  const revenue = Number(value("revenue")?.value || 0);
  const age = Number(value("age")?.value || 999999);
  const freeShipping = Boolean(value("freeShipping")?.checked);
  const sort = value("sort")?.value || "original";

  cards.forEach((card, index) => {
    if (!card.dataset.radarOriginalIndex) {
      card.dataset.radarOriginalIndex = String(index);
    }

    const visible =
      Number(card.dataset.radarScore || 0) >= score &&
      (!demand || card.dataset.radarDemand === demand) &&
      Number(card.dataset.radarSales || 0) >= sales &&
      Number(card.dataset.radarRevenue || 0) >= revenue &&
      Number(card.dataset.radarAge || 999999) <= age &&
      (!freeShipping || card.dataset.radarFreeShipping === "1");

    card.style.display = visible ? "" : "none";
  });

  const parents = new Set(cards.map((card) => card.parentElement).filter(Boolean));
  if (parents.size !== 1) return;

  const parent = [...parents][0];
  const sorted = [...cards].sort((a, b) => {
    if (sort === "score") {
      return Number(b.dataset.radarScore || 0) - Number(a.dataset.radarScore || 0);
    }
    if (sort === "sales") {
      return Number(b.dataset.radarSales || 0) - Number(a.dataset.radarSales || 0);
    }
    if (sort === "revenue") {
      return Number(b.dataset.radarRevenue || 0) - Number(a.dataset.radarRevenue || 0);
    }
    if (sort === "newest") {
      return Number(a.dataset.radarAge || 999999) - Number(b.dataset.radarAge || 999999);
    }
    return Number(a.dataset.radarOriginalIndex || 0) - Number(b.dataset.radarOriginalIndex || 0);
  });

  sorted.forEach((card) => parent.appendChild(card));
}

function mountFilterPanel() {
  if (document.getElementById("mercado-radar-filters")) return;

  const cards = findSearchCards();
  if (cards.length < 3) return;

  const panel = document.createElement("section");
  panel.id = "mercado-radar-filters";
  panel.className = "mercado-radar-filters";
  panel.innerHTML = filterMarkup();

  const sidebar =
    document.querySelector(".ui-search-sidebar") ||
    document.querySelector("[class*='ui-search-sidebar']");

  if (sidebar) {
    sidebar.prepend(panel);
  } else {
    panel.classList.add("mercado-radar-filters--fixed");
    document.body.appendChild(panel);
  }

  panel.addEventListener("change", applyFilters);
  panel.querySelector("[data-radar-reset]")?.addEventListener("click", () => {
    panel.querySelectorAll("select").forEach((select) => {
      select.selectedIndex = 0;
    });
    const freeShipping = panel.querySelector("[data-radar-filter='freeShipping']");
    if (freeShipping) freeShipping.checked = false;
    applyFilters();
  });
}

function publishContext() {
  const referenceId = getCurrentReference();
  const title = (document.querySelector("h1")?.textContent || "").trim();
  const price = getPagePrice();

  chrome.runtime.sendMessage({
    type: "RADAR_CONTEXT_UPDATE",
    context: {
      url: location.href,
      referenceId,
      title: title || null,
      visiblePrice: price,
      updatedAt: new Date().toISOString(),
    },
  }).catch(() => {});
}

async function enrichSearch() {
  if (state.running) return;

  const query = extractSearchQuery();
  const cards = findSearchCards();
  if (!query || cards.length < 2) {
    publishContext();
    return;
  }

  state.running = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RADAR_FETCH",
      path: "/api/extension/search?q=" + encodeURIComponent(query),
    });

    if (!response?.ok || !Array.isArray(response.body?.items)) return;

    state.items = response.body.items;
    const matches = matchItems(cards, state.items);

    for (const match of matches) {
      ensureBadge(match.card, match.item, match.cardPrice);
    }

    mountFilterPanel();
    applyFilters();
    publishContext();
  } finally {
    state.running = false;
  }
}

const observer = new MutationObserver(() => {
  if (location.href !== state.lastUrl) {
    state.lastUrl = location.href;
    document.getElementById("mercado-radar-filters")?.remove();
    publishContext();
  }

  clearTimeout(window.__mercadoRadarTimer);
  window.__mercadoRadarTimer = setTimeout(enrichSearch, 700);
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

publishContext();
enrichSearch();
