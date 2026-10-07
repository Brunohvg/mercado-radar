/**
 * Camada única de leitura do DOM do Mercado Livre.
 *
 * Toda dependência de classe/estrutura do ML fica AQUI. Quando o layout do
 * Mercado Livre mudar, só este arquivo precisa ser ajustado, e o healthCheck()
 * avisa o usuário em vez de falhar em silêncio.
 *
 * Âncoras do anúncio (PDP) são heurísticas com fallback: se nenhuma existir,
 * o widget vira um cartão flutuante e continua funcionando.
 */
(() => {
  const CARD_SELECTORS =
    "li.ui-search-layout__item, .ui-search-result, .poly-card";

  const TITLE_SELECTORS = [
    ".poly-component__title",
    ".ui-search-item__title",
    "h2",
    "a[title]",
  ];

  const CARD_PRICE_SELECTORS = [
    ".poly-price__current",
    ".ui-search-price__second-line",
    ".ui-search-price",
  ];

  const PDP_PRICE_SELECTORS = [
    ".ui-pdp-price__second-line",
    ".ui-pdp-price",
    "[data-testid='price-part']",
  ];

  const SEARCH_INPUT_SELECTORS = [
    "#cb1-edit",
    "input[name='as_word']",
    "input.nav-search-input",
  ];

  const SIDEBAR_SELECTORS = [".ui-search-sidebar", "[class*='ui-search-sidebar']"];

  const PDP_COLUMN_SELECTORS = [
    ".ui-vip-core-container--column__right",
    ".ui-pdp-container--column-right",
    ".ui-pdp-container__col.col-1",
    ".ui-pdp--sticky-wrapper",
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function first(selectors, root = document) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function referenceFromHref(href) {
    const match = String(href || "").match(/MLB(U)?-?(\d+)/i);
    if (!match) return null;
    return "MLB" + (match[1] ? "U" : "") + match[2];
  }

  function currentReference() {
    return referenceFromHref(location.href);
  }

  function parseMoneyAmount(container) {
    if (!container) return null;
    const fraction = container.querySelector(".andes-money-amount__fraction");
    const cents = container.querySelector(".andes-money-amount__cents");
    if (!fraction) return null;

    const integer = Number((fraction.textContent || "").replace(/\D/g, ""));
    const decimal = cents
      ? Number(
          (cents.textContent || "").replace(/\D/g, "").slice(0, 2).padEnd(2, "0"),
        ) / 100
      : 0;

    const value = integer + decimal;
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function cardTitle(card) {
    const element = first(TITLE_SELECTORS, card);
    return (element?.textContent || element?.getAttribute("title") || "").trim();
  }

  function cardReference(card) {
    for (const link of card.querySelectorAll("a[href*='MLB']")) {
      const id = referenceFromHref(link.href);
      if (id) return id;
    }
    return null;
  }

  function cardPrice(card) {
    return parseMoneyAmount(first(CARD_PRICE_SELECTORS, card) || card);
  }

  function parseSoldLowerBound(text) {
    const match = normalize(text).match(
      /\+?\s*(\d+(?:[.,]\d+)?)\s*(mil|k)?\s+vendid/,
    );
    if (!match) return null;

    const numeric = Number(String(match[1]).replace(",", "."));
    if (!Number.isFinite(numeric)) return null;

    return Math.round(numeric * (match[2] === "mil" || match[2] === "k" ? 1000 : 1));
  }

  function cardSoldLowerBound(card) {
    return parseSoldLowerBound(card.textContent || "");
  }

  function cardShipping(card) {
    const text = normalize(card.textContent || "");
    return {
      freeShipping: text.includes("frete gratis"),
      logisticType:
        text.includes(" full") || text.startsWith("full") ? "fulfillment" : null,
    };
  }

  function pagePrice() {
    for (const selector of PDP_PRICE_SELECTORS) {
      const value = parseMoneyAmount(document.querySelector(selector));
      if (value) return value;
    }
    return null;
  }

  function pageTitle() {
    return (document.querySelector("h1")?.textContent || "").trim();
  }

  function findCards() {
    const candidates = [...document.querySelectorAll(CARD_SELECTORS)];

    return candidates.filter((card, index, all) => {
      if (!cardTitle(card)) return false;
      return !all.some(
        (other, otherIndex) => otherIndex < index && other.contains(card),
      );
    });
  }

  function extractQuery() {
    const input = first(SEARCH_INPUT_SELECTORS);
    const value = input?.value?.trim();
    if (value && value.length >= 2) return value;

    const query = new URL(location.href).searchParams.get("q");
    if (query && query.trim().length >= 2) return query.trim();

    return null;
  }

  function findSidebar() {
    return first(SIDEBAR_SELECTORS);
  }

  /**
   * Onde encaixar o widget do anúncio.
   * Retorna { element, position } ou null (=> modo flutuante).
   */
  function findPdpAnchor() {
    const price = document.querySelector(".ui-pdp-price");
    const row = price?.closest(".ui-pdp-container__row");
    if (row) return { element: row, position: "afterend" };

    const column = first(PDP_COLUMN_SELECTORS);
    if (column) return { element: column, position: "afterbegin" };

    return null;
  }

  function isProductPage() {
    return Boolean(currentReference()) && Boolean(document.querySelector("h1"));
  }

  /**
   * Diagnóstico de compatibilidade com o layout atual do ML.
   * Retorna { ok, problems[] } e nunca lança.
   */
  function healthCheck() {
    const problems = [];

    try {
      const cards = findCards();
      const onSearch = Boolean(extractQuery()) && !currentReference();

      if (onSearch && cards.length === 0) {
        problems.push("Nenhum anúncio reconhecido na busca.");
      }

      if (onSearch && cards.length > 0) {
        const withPrice = cards.filter((card) => cardPrice(card)).length;
        const withRef = cards.filter((card) => cardReference(card)).length;
        if (withPrice / cards.length < 0.5) problems.push("Preços não reconhecidos.");
        if (withRef / cards.length < 0.5) problems.push("Códigos MLB não reconhecidos.");
      }

      if (isProductPage() && cards.length < 2 && !pagePrice()) {
        problems.push("Preço do anúncio não reconhecido.");
      }
    } catch (error) {
      problems.push("Erro ao ler a página: " + (error?.message || "desconhecido"));
    }

    return { ok: problems.length === 0, problems };
  }

  globalThis.RadarSelectors = {
    normalize,
    referenceFromHref,
    currentReference,
    parseMoneyAmount,
    cardTitle,
    cardReference,
    cardPrice,
    cardSoldLowerBound,
    cardShipping,
    pagePrice,
    pageTitle,
    findCards,
    extractQuery,
    findSidebar,
    findPdpAnchor,
    isProductPage,
    healthCheck,
  };
})();
