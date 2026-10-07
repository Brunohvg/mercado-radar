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

  /**
   * Separa o ID do ANÚNCIO (MLB-1234567890 / item_id:MLB… / wid=MLB…) do ID do
   * PRODUTO DE CATÁLOGO (/p/MLB12345). Os dois começam com "MLB"; confundir um
   * com o outro faz o Radar medir o anúncio errado.
   */
  function idsFromHref(href) {
    const raw = String(href || "");
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {}

    const explicit =
      decoded.match(/item_id[:=]\s*(MLB)-?(\d{6,})/i) ||
      decoded.match(/[?&#]wid=(MLB)-?(\d{6,})/i);
    const product = decoded.match(/\/p\/(MLB)(\d{5,})/i);
    const listing = decoded.match(/(?:^|\/)(MLB)-(\d{6,})/i);

    return {
      itemId: explicit
        ? "MLB" + explicit[2]
        : listing
          ? "MLB" + listing[2]
          : null,
      productId: product ? "MLB" + product[2] : null,
    };
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

  /**
   * Ponto onde a faixa do Radar entra no card: logo DEPOIS do bloco do título,
   * dentro do conteúdo do card (o card cresce junto). Inserir no fim do <li>
   * faz a faixa vazar sobre o bloco seguinte, porque o Mercado Livre fixa a
   * altura da linha da grade.
   */
  function cardStripAnchor(card) {
    const element = first(TITLE_SELECTORS, card);
    if (!element) return null;
    const wrapper =
      element.closest(
        ".poly-component__title-wrapper, .ui-search-item__group--title, h2, h3",
      ) || element.parentElement;
    return wrapper && wrapper !== card && card.contains(wrapper) ? wrapper : null;
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

  /**
   * "+1000 vendidos", "+5 mil vendidos", "Mais de 1.000 vendidos", "3 vendidos".
   * Retorna { lower, hasPlus, label } ou null.
   */
  function parseSold(text) {
    const raw = String(text || "").toLowerCase().replace(/\s+/g, " ");
    const match = raw.match(
      /(\+|mais de)?\s*(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(mil|k)?\s*vendid[oa]s?/,
    );
    if (!match) return null;

    const digits = match[2].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const numeric = Number(digits);
    if (!Number.isFinite(numeric)) return null;

    const lower = Math.round(numeric * (match[3] ? 1000 : 1));
    return {
      lower,
      hasPlus: Boolean(match[1]),
      label: match[0].trim(),
    };
  }

  function parseSoldLowerBound(text) {
    return parseSold(text)?.lower ?? null;
  }

  function cardSoldLowerBound(card) {
    return parseSoldLowerBound(card.textContent || "");
  }

  /** "(1.234)" → 1234 */
  function parseCount(text) {
    const match = String(text || "").match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)/);
    if (!match) return null;
    const value = Number(match[1].replace(/[.\s]/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  /** "4.8" / "4,8" → 4.8 (0–5) */
  function parseRating(text) {
    const match = String(text || "").match(/([0-5](?:[.,]\d)?)/);
    if (!match) return null;
    const value = Number(match[1].replace(",", "."));
    return value >= 0 && value <= 5 ? value : null;
  }

  function cardShipping(card) {
    const text = normalize(card.textContent || "");
    return {
      freeShipping: text.includes("frete gratis"),
      logisticType:
        text.includes(" full") || text.startsWith("full") ? "fulfillment" : null,
    };
  }

  function textOf(root, selectors) {
    const element = first(selectors, root);
    return element ? (element.textContent || "").trim() : "";
  }

  function cardIds(card) {
    let itemId = null;
    let productId = null;
    for (const link of card.querySelectorAll("a[href*='MLB']")) {
      const ids = idsFromHref(link.getAttribute("href") || link.href);
      itemId = itemId || ids.itemId;
      productId = productId || ids.productId;
      if (itemId && productId) break;
    }
    return { itemId, productId };
  }

  function cardRating(card) {
    const ratingText = textOf(card, [".poly-reviews__rating", ".ui-search-reviews__rating-number"]);
    const totalText = textOf(card, [".poly-reviews__total", ".ui-search-reviews__amount"]);
    let rating = parseRating(ratingText);
    let reviews = parseCount(totalText);

    if (rating == null || reviews == null) {
      const label = card.querySelector("[aria-label*='valia' i], [aria-label*='opini' i]")?.getAttribute("aria-label") || "";
      const fromLabel = label.match(/([0-5][.,]\d)[^\d]+(\d[\d.]*)\s*(opini|avalia)/i);
      if (fromLabel) {
        rating = rating ?? parseRating(fromLabel[1]);
        reviews = reviews ?? parseCount(fromLabel[2]);
      }
    }

    if (rating == null || reviews == null) {
      const inline = (card.textContent || "").match(/\b([1-5][.,]\d)\s*\(\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*\)/);
      if (inline) {
        rating = rating ?? parseRating(inline[1]);
        reviews = reviews ?? parseCount(inline[2]);
      }
    }

    return { rating, reviews };
  }

  function bestSeller(root) {
    const text = normalize(root.textContent || "");
    const highlight = textOf(root, [
      ".poly-component__highlight",
      ".ui-search-styled-label",
      ".ui-pdp-promotions-pill-label",
      "[class*='highlight']",
    ]);
    const isBest = text.includes("mais vendido");
    if (!isBest) return { rank: null, label: null };
    const rank = text.match(/(\d{1,3})\s*o?\s*em\s+[a-z]/);
    return {
      rank: rank && Number(rank[1]) >= 1 ? Number(rank[1]) : null,
      label: (highlight || (isBest ? "Mais vendido" : "")).slice(0, 120) || null,
    };
  }

  function isFulfillment(root) {
    if (root.querySelector("[aria-label='Full' i], svg[aria-label='Full' i], [class*='fulfillment']")) return true;
    const text = " " + normalize(root.textContent || "") + " ";
    if (text.includes("enviado pelo full") || text.includes("armazenado e enviado")) return true;
    // "Full" sozinho como selo; evita "Full HD", "Full Frame" etc.
    return [...root.querySelectorAll("span, p, div, svg title")].some(
      (el) => el.children.length === 0 && normalize(el.textContent || "").trim() === "full",
    );
  }

  function hasFreeShipping(root) {
    const text = normalize(root.textContent || "");
    return text.includes("frete gratis") || text.includes("chegara gratis") || text.includes("envio gratis") || text.includes("chegara gratis");
  }

  function imageOf(root) {
    const img = root.querySelector("img");
    const src = img?.getAttribute("data-src") || img?.currentSrc || img?.src || "";
    return /^https:\/\//.test(src) ? src.slice(0, 500) : null;
  }

  function cleanUrl(href) {
    try {
      const url = new URL(href, location.href);
      url.hash = "";
      return url.toString().slice(0, 800);
    } catch {
      return null;
    }
  }

  function moneyFrom(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const value = parseMoneyAmount(element?.matches(".andes-money-amount") ? element : element?.querySelector(".andes-money-amount") || element);
      if (value) return value;
    }
    return null;
  }

  /**
   * Tudo o que o card da busca mostra, já normalizado para o Radar.
   * Retorna null se o card não tiver ID de anúncio identificável.
   */
  function cardObservation(card, index) {
    const { itemId, productId } = cardIds(card);
    if (!itemId) return null;

    const title = cardTitle(card);
    if (!title) return null;

    const sold = parseSold(card.textContent || "");
    const { rating, reviews } = cardRating(card);
    const best = bestSeller(card);
    const link = card.querySelector("a[href*='MLB']");
    const seller = textOf(card, [".poly-component__seller", ".ui-search-official-store-label"])
      .replace(/^por\s+/i, "")
      .trim();

    return {
      id: itemId,
      title: title.slice(0, 300),
      price: cardPrice(card),
      originalPrice: moneyFrom(card, [".andes-money-amount--previous", "s.andes-money-amount", ".poly-price__original"]),
      soldLower: sold ? sold.lower : null,
      soldHasPlus: sold ? sold.hasPlus : true,
      soldLabel: sold ? sold.label.slice(0, 60) : null,
      reviews,
      rating,
      freeShipping: hasFreeShipping(card),
      fulfillment: isFulfillment(card),
      bestSellerRank: best.rank,
      bestSellerLabel: best.label,
      catalogProductId: productId,
      sellerName: seller ? seller.slice(0, 120) : null,
      thumbnail: imageOf(card),
      permalink: link ? cleanUrl(link.getAttribute("href") || link.href) : null,
      position: index + 1,
    };
  }

  function jsonLdProduct() {
    for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
      try {
        const data = JSON.parse(script.textContent || "null");
        const list = Array.isArray(data) ? data : data?.["@graph"] || [data];
        const product = list.find((entry) => entry && /product/i.test(String(entry["@type"])));
        if (product) return product;
      } catch {}
    }
    return null;
  }

  /** IDs de anúncio, catálogo e categoria a partir da URL e de dados embutidos na página. */
  function pageIds() {
    const fromUrl = idsFromHref(location.href);
    let itemId = fromUrl.itemId;
    const productId = fromUrl.productId;

    if (!itemId) {
      const input = document.querySelector("input[name='item_id'], input[name='itemId']");
      const value = (input?.value || "").toUpperCase();
      if (/^MLB\d{6,}$/.test(value)) itemId = value;
    }

    let categoryId = null;
    // Dados embutidos pelo próprio Mercado Livre (só leitura de texto; nada é executado).
    for (const script of document.querySelectorAll("script:not([src])")) {
      const text = script.textContent || "";
      if (text.length > 2_000_000) continue;
      if (!itemId) {
        const m = text.match(/"item_id"\s*:\s*"(MLB\d{6,})"/);
        if (m) itemId = m[1];
      }
      if (!categoryId) {
        const c = text.match(/"category_id"\s*:\s*"(MLB\d{3,})"/);
        if (c) categoryId = c[1];
      }
      if (itemId && categoryId) break;
    }

    return { itemId, productId, categoryId };
  }

  /** Observação do anúncio aberto (PDP). */
  function pageObservation() {
    const { itemId, productId, categoryId } = pageIds();
    if (!itemId) return null;

    const ld = jsonLdProduct();
    const subtitle = textOf(document, [".ui-pdp-subtitle", ".ui-pdp-header__subtitle"]);
    const sold = parseSold(subtitle) || parseSold(textOf(document, [".ui-pdp-header"]));
    const condition = /usado/i.test(subtitle) ? "usado" : /novo/i.test(subtitle) ? "novo" : null;

    let rating = parseRating(textOf(document, [".ui-pdp-review__rating", ".ui-review-capability__rating__average"]));
    let reviews = parseCount(textOf(document, [".ui-pdp-review__amount", ".ui-review-capability__rating__label"]));
    const aggregate = ld?.aggregateRating;
    if (aggregate) {
      rating = rating ?? parseRating(String(aggregate.ratingValue ?? ""));
      reviews = reviews ?? parseCount(String(aggregate.reviewCount ?? aggregate.ratingCount ?? ""));
    }

    const header = document.querySelector(".ui-pdp-header") || document;
    const best = bestSeller(header);
    const buyBox = document.querySelector(".ui-pdp-container--column-right, .ui-vip-core-container--column__right") || document.body;
    const seller = (
      textOf(document, [".ui-pdp-seller__link-trigger", ".ui-pdp-seller__header__title"]) ||
      ((buyBox.textContent || "").match(/vendido por\s+([^\n|]{2,60})/i)?.[1] ?? "")
    )
      .replace(/^vendido por\s+/i, "")
      .trim();

    const ldPrice = Number(ld?.offers?.price ?? (Array.isArray(ld?.offers) ? ld.offers[0]?.price : NaN));
    const price = pagePrice() ?? (Number.isFinite(ldPrice) && ldPrice > 0 ? ldPrice : null);
    const image = document.querySelector("meta[property='og:image']")?.getAttribute("content") || (Array.isArray(ld?.image) ? ld.image[0] : ld?.image) || null;
    const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href") || location.href;
    const buyText = normalize(buyBox.textContent || "");

    return {
      id: itemId,
      title: (pageTitle() || ld?.name || "").slice(0, 300),
      price,
      originalPrice: moneyFrom(document, [".ui-pdp-price__original-value", ".andes-money-amount--previous"]),
      soldLower: sold ? sold.lower : null,
      soldHasPlus: sold ? sold.hasPlus : true,
      soldLabel: sold ? sold.label.slice(0, 60) : null,
      reviews,
      rating,
      freeShipping: hasFreeShipping(buyBox),
      fulfillment: isFulfillment(buyBox),
      bestSellerRank: best.rank,
      bestSellerLabel: best.label,
      catalogProductId: productId,
      sellerName: seller ? seller.slice(0, 120) : null,
      condition,
      thumbnail: typeof image === "string" && /^https:\/\//.test(image) ? image.slice(0, 500) : null,
      permalink: cleanUrl(canonical),
      position: null,
      // dicas para a calculadora (não são gravadas no histórico)
      categoryId,
      listingTypeHint: buyText.includes("sem juros") ? "PREMIUM" : "CLASSIC",
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
    idsFromHref,
    parseSold,
    parseCount,
    parseRating,
    cardIds,
    cardObservation,
    pageIds,
    pageObservation,
    currentReference,
    parseMoneyAmount,
    cardTitle,
    cardStripAnchor,
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
