/**
 * Identidade comercial de um produto a partir de um anúncio do Mercado Livre.
 * Só usa o que a fonte informa. Ausência continua ausência (null).
 */

export type ListingAttribute = {
  id?: string;
  name?: string;
  value_name?: string | null;
};

export type ProductIdentity = {
  title: string;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  gtin: string | null;
  gtinValid: boolean | null;
  packQuantity: number | null;
  packQuantitySource: "ATRIBUTO" | "TITULO" | null;
  searchTerms: string[];
  facts: Array<{ label: string; value: string; source: "ATRIBUTO" | "TITULO" }>;
};

const GENERIC_BRANDS = new Set([
  "generico",
  "genérico",
  "generica",
  "genérica",
  "sem marca",
  "outro",
  "outros",
  "n/a",
  "na",
  "importado",
]);

const UNIT_ATTRIBUTE_IDS = [
  "UNITS_PER_PACK",
  "UNITS_PER_PACKAGE",
  "PACKAGE_UNITS",
  "SALE_FORMAT_UNITS",
];

function clean(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

function attribute(attributes: ListingAttribute[], ids: string[]) {
  for (const id of ids) {
    const found = attributes.find((item) => item.id === id);
    const value = clean(found?.value_name);
    if (value) return value;
  }
  return null;
}

export function isValidGtin(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1).split("").reverse();
  const sum = body.reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/**
 * Quantidade de peças explícita no título ("1000 unidades", "kit 50 peças",
 * "c/ 100"). Números de modelo como "nº 54" ou medidas como "165m" não contam.
 */
export function packQuantityFromTitle(title: string): number | null {
  const text = title.toLowerCase();
  const patterns = [
    /(\d{1,3}(?:\.\d{3})+|\d{1,6})\s*(?:unidades|unidade|unds?|un\b|pçs|pcs|peças|peca|peça|pares)/,
    /(?:kit|pacote|caixa|cx|c\/|com)\s*(\d{1,3}(?:\.\d{3})+|\d{1,6})\b(?!\s*(?:m\b|cm|mm|ml|l\b|g\b|kg|w\b|v\b))/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1].replace(/\./g, ""));
      if (Number.isFinite(value) && value > 1 && value <= 100000) return value;
    }
  }
  return null;
}

export function extractIdentity(input: {
  title: string;
  attributes?: ListingAttribute[];
}): ProductIdentity {
  const attributes = input.attributes ?? [];
  const title = clean(input.title) ?? "";
  const facts: ProductIdentity["facts"] = [];

  let brand = attribute(attributes, ["BRAND"]);
  if (brand && GENERIC_BRANDS.has(brand.toLowerCase())) brand = null;
  const model = attribute(attributes, ["MODEL", "LINE"]);
  const manufacturer = attribute(attributes, ["MANUFACTURER"]);
  const gtinRaw = attribute(attributes, ["GTIN", "EAN", "UPC"]);
  const gtin = gtinRaw ? gtinRaw.replace(/\D/g, "") || null : null;

  if (brand) facts.push({ label: "Marca", value: brand, source: "ATRIBUTO" });
  if (model) facts.push({ label: "Modelo", value: model, source: "ATRIBUTO" });
  if (manufacturer)
    facts.push({ label: "Fabricante", value: manufacturer, source: "ATRIBUTO" });
  if (gtin) facts.push({ label: "GTIN/EAN", value: gtin, source: "ATRIBUTO" });

  let packQuantity: number | null = null;
  let packQuantitySource: ProductIdentity["packQuantitySource"] = null;
  const unitAttr = attribute(attributes, UNIT_ATTRIBUTE_IDS);
  const unitNumber = unitAttr ? Number(unitAttr.replace(/\D/g, "")) : NaN;
  if (Number.isFinite(unitNumber) && unitNumber >= 1) {
    packQuantity = unitNumber;
    packQuantitySource = "ATRIBUTO";
  } else {
    packQuantity = packQuantityFromTitle(title);
    if (packQuantity) packQuantitySource = "TITULO";
  }
  if (packQuantity)
    facts.push({
      label: "Unidades por anúncio",
      value: String(packQuantity),
      source: packQuantitySource ?? "TITULO",
    });

  return {
    title,
    brand,
    model,
    manufacturer,
    gtin,
    gtinValid: gtin ? isValidGtin(gtin) : null,
    packQuantity,
    packQuantitySource,
    searchTerms: searchTermsFor({ title, brand, model }),
    facts,
  };
}

const STOP = new Set([
  "de", "da", "do", "das", "dos", "para", "com", "e", "em", "kit", "c/",
  "original", "promoção", "promocao", "oferta", "frete", "grátis", "gratis",
  "envio", "imediato", "novo", "nova", "unidades", "unidade", "peças", "pecas",
]);

/** Termo curto do produto: palavras relevantes do título, sem quantidades. */
export function productCore(title: string, limit = 5) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}º°\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word) && !/^\d{3,}$/.test(word))
    .slice(0, limit)
    .join(" ");
}

function searchTermsFor(input: {
  title: string;
  brand: string | null;
  model: string | null;
}) {
  const core = productCore(input.title);
  const terms = new Set<string>();
  if (input.brand && input.model) terms.add(`${input.brand} ${input.model}`);
  if (input.brand) {
    const brandWords = new Set(input.brand.toLowerCase().split(/\s+/));
    const rest = core
      .split(" ")
      .filter((word) => !brandWords.has(word))
      .join(" ");
    terms.add(`${input.brand} ${rest}`.trim());
  }
  terms.add(core);
  return [...terms].filter(Boolean).slice(0, 3);
}
