"use client";

import { useMemo, useState, type FormEvent, type CSSProperties } from "react";

type Discovery = {
  identification?: {
    name?: string;
    categoryId?: string | null;
    categoryName?: string | null;
    source?: string;
  };
  market?: {
    comparableCount?: number;
    minimumPrice?: number | null;
    medianPrice?: number | null;
    maximumPrice?: number | null;
    source?: string;
  };
  dimensions?: {
    weightGrams?: number;
    heightCm?: number;
    widthCm?: number;
    lengthCm?: number;
    sampleSize?: number;
    confidence?: string;
  } | null;
};

type PriceResponse = {
  suggestedPrice?: number;
  analysis?: { profit: number; marginPercent: number; roiPercent: number };
  quote?: { commissionPercent: number; fixedFee: number; shippingCost: number };
  error?: string;
};

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "9px 12px",
  border: "1px solid var(--border, #8c9f9a)",
  borderRadius: 9,
  background: "var(--surface, transparent)",
  color: "inherit",
};

const fieldStyle: CSSProperties = { display: "grid", gap: 5, minWidth: 0 };
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 12,
};
const buttonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 9,
  padding: "8px 16px",
  cursor: "pointer",
};

function positiveNumber(input: string) {
  const n = Number(input.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function nonnegativeNumber(input: string) {
  const n = Number(input.trim().replace(",", "."));
  return input.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "A consulta não foi concluída.");
  }
  return body as T;
}

export function ListingDraftAssistant({
  initialName = "",
  initialReference = "",
  fromExtension = false,
}: {
  initialName?: string;
  initialReference?: string;
  fromExtension?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [units, setUnits] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [operatingCost, setOperatingCost] = useState("");
  const [discount, setDiscount] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [listingType, setListingType] = useState<"CLASSIC" | "PREMIUM">("CLASSIC");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState<"discover" | "price" | null>(null);
  const [error, setError] = useState("");

  // This is a deterministic preview, NOT model-generated ad copy.
  const draftTitle = useMemo(() => {
    const base = name.trim().replace(/\s+/g, " ");
    const manufacturer = brand.trim();
    return (manufacturer && !base.toLowerCase().includes(manufacturer.toLowerCase())
      ? manufacturer + " " + base
      : base).slice(0, 120);
  }, [name, brand]);

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 3) {
      setError("Descreva o produto com pelo menos 3 caracteres.");
      return;
    }
    setLoading("discover");
    setError("");
    setDiscovery(null);
    setPrice(null);
    setCategoryId("");
    setCategoryName("");
    try {
      const data = await postJson<Discovery>("/api/ml/product-discovery", { query: name.trim() });
      setDiscovery(data);
      setCategoryId(data.identification?.categoryId ?? "");
      setCategoryName(data.identification?.categoryName ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível identificar o produto.");
    } finally {
      setLoading(null);
    }
  }

  async function simulatePrice() {
    setError("");
    setPrice(null);
    const cost = positiveNumber(purchaseCost);
    const kitQuantity = positiveNumber(units);
    const operating = nonnegativeNumber(operatingCost);
    const discountPercent = nonnegativeNumber(discount);
    const weightGrams = positiveNumber(weight);
    const heightCm = positiveNumber(height);
    const widthCm = positiveNumber(width);
    const lengthCm = positiveNumber(length);
    if (!categoryId || !cost || !kitQuantity || !Number.isInteger(kitQuantity) ||
      operating === null || discountPercent === null ||
      weightGrams === null || heightCm === null || widthCm === null || lengthCm === null) {
      setError("Confirme categoria, custo unitário, quantidade, custo operacional e medidas reais da embalagem. Não vamos inventar dados para calcular frete.");
      return;
    }
    setLoading("price");
    try {
      const result = await postJson<PriceResponse>("/api/ml/suggest-price", {
        productName: draftTitle,
        supplierPrice: cost,
        kitQuantity,
        operatingCost: operating,
        discountPercent,
        categoryId,
        listingType,
        weightGrams,
        heightCm,
        widthCm,
        lengthCm,
      });
      setPrice(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cotar as tarifas.");
    } finally {
      setLoading(null);
    }
  }

  const label = (text: string, value: string, onChange: (v: string) => void, placeholder = "", required = false) =>
    <label style={fieldStyle}>
      <span>{text}</span>
      <input style={inputStyle} value={value} onChange={(event) => { onChange(event.target.value); setPrice(null); }} placeholder={placeholder} required={required} />
    </label>;

  return (
    <div style={{ maxWidth: 1050, display: "grid", gap: 18, paddingBottom: 30 }}>
      <header>
        <p style={{ opacity: .7, marginBottom: 4 }}>Mercado Radar / Operação</p>
        <h1 style={{ margin: "0 0 6px" }}>Assistente de anúncios</h1>
        <p>Comece com qualquer produto permitido pelo Mercado Livre. Primeiro identificamos, depois precificamos e preparamos o rascunho para revisão.</p>
      </header>
      {fromExtension && (
        <div className="card" style={{ padding: 15 }}>
          <strong>Produto enviado pela extensão</strong>
          <p style={{ margin: "4px 0 0" }}>Use a leitura como ponto de partida; confirme marca, variação, quantidade e embalagem. {/^MLB(?:U)?\d{5,}$/.test(initialReference) ? "Referência observada: " + initialReference : ""}</p>
        </div>
      )}
      <section className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>1. Qual produto você quer vender?</h2>
        <form onSubmit={identify} style={{ display: "grid", gap: 12 }}>
          {label("Nome ou EAN do produto", name, setName, "Ex.: tinta pinta couro Shake Paint 37 ml", true)}
          <div style={gridStyle}>
            {label("Marca confirmada (opcional)", brand, setBrand, "Ex.: Acrilex")}
            {label("SKU interno (opcional)", sku, setSku, "Seu código de estoque")}
          </div>
          <button type="submit" style={buttonStyle} disabled={loading !== null}>
            {loading === "discover" ? "Consultando catálogo e mercado…" : "Identificar produto e categoria"}
          </button>
        </form>
        {discovery && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 7 }}>Resultado da identificação</h3>
            <p>Categoria sugerida: <strong>{categoryName || "Não identificada"}</strong> {categoryId && "(" + categoryId + ")"}. Revise a categoria antes de seguir.</p>
            <p>Comparáveis encontrados: {discovery.market?.comparableCount ?? "indisponível"}. Mediana de preços observados: <strong>{money(discovery.market?.medianPrice)}</strong>. Comparabilidade e período precisam de validação; isso não representa vendas garantidas.</p>
            {discovery.dimensions && <p>Foram observadas medidas de referência no catálogo, mas não serão copiadas automaticamente. Confirme o peso e as dimensões da sua embalagem.</p>}
            {!categoryId && label("Categoria do Mercado Livre (ID confirmado)", categoryId, setCategoryId, "Ex.: MLB1234")}
          </div>
        )}
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>2. Confirme seus custos</h2>
        <p>Dados financeiros e dimensões reais são necessários para calcular uma margem confiável.</p>
        <div style={gridStyle}>
          {label("Custo de compra por unidade (R$)", purchaseCost, setPurchaseCost, "Ex.: 7,50")}
          {label("Unidades por kit", units, setUnits)}
          {label("Desconto do fornecedor (%)", discount, setDiscount)}
          {label("Custo operacional por venda (R$)", operatingCost, setOperatingCost, "Informe inclusive 0")}
          <label style={fieldStyle}>Modalidade
            <select style={inputStyle} value={listingType} onChange={e => { setListingType(e.target.value as "CLASSIC" | "PREMIUM"); setPrice(null); }}>
              <option value="CLASSIC">Clássico</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </label>
        </div>
        <details style={{ marginTop: 16 }} open>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Embalagem para cotação de frete</summary>
          <div style={{ ...gridStyle, marginTop: 12 }}>
            {label("Peso em gramas", weight, setWeight)}
            {label("Altura em cm", height, setHeight)}
            {label("Largura em cm", width, setWidth)}
            {label("Comprimento em cm", length, setLength)}
          </div>
        </details>
        <button type="button" onClick={simulatePrice} style={{ ...buttonStyle, marginTop: 14 }} disabled={loading !== null || !discovery}>
          {loading === "price" ? "Cotando tarifas e frete…" : "Calcular preço e lucro"}
        </button>
        {!discovery && <p>Identifique o produto na primeira etapa para liberar a cotação.</p>}
      </section>
      {error && <p role="alert" style={{ color: "var(--danger, #d05043)" }}>{error}</p>}
      <section className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>3. Rascunho para revisão</h2>
        <p><strong>Título preliminar:</strong> {draftTitle || "Aguardando produto"}</p>
        <p><strong>Categoria:</strong> {categoryName || categoryId || "Aguardando identificação"}</p>
        <p><strong>SKU:</strong> {sku.trim() || "Não informado"}</p>
        <p><strong>Preço saudável sugerido:</strong> {money(price?.suggestedPrice)}</p>
        {price?.analysis && <p>Lucro estimado: <strong>{money(price.analysis.profit)}</strong> · Margem: {price.analysis.marginPercent.toFixed(2)}% · ROI: {price.analysis.roiPercent.toFixed(2)}%.</p>}
        <p>Imagens reais do produto, atributos obrigatórios, descrição final, estoque e validação de publicação ainda precisam ser concluídos. Não há publicação nem alteração de anúncio nesta versão.</p>
        <p style={{ opacity: .75, fontSize: 13 }}>Esta é a etapa inicial, sem IA generativa conectada. Os cálculos utilizam o motor financeiro e as APIs do Radar; não são criados números por IA.</p>
      </section>
    </div>
  );
}
