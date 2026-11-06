"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ListingDraftManager, type DraftValues } from "@/components/listing-draft-manager";

type Discovery = {
  catalogStrategy?: { status: string; recommendation: string; reason: string; productId: string | null; productName: string | null; competitionPrice: number | null; restrictions: string[] };
  categorySuggestions?: Array<{ categoryId: string; categoryName: string; source: string; path?: string | null; listingAllowed?: boolean | null }>;
  identification?: {
    name?: string;
    brand?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    source?: string;
    catalogProductId?: string | null;
    verified?: boolean;
    requiresProductName?: boolean;
  };
  notice?: string;
  categoryNotice?: string | null;
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

type ShippingPreferences = {
  choices: Array<{ type: string; label: string; default: boolean }>;
  defaultType: string | null;
  verified: boolean;
  notice?: string;
};
type AiConfig = { provider: string; model: string; configured: boolean; message: string };
type AiDraft = {
  title: string;
  description: string;
  missingFacts: string[];
  provider: "gemini";
  requiresReview: true;
  verifiedFactsCount?: number;
  verifiedSource?: string | null;
};

type PriceResponse = {
  suggestedPrice?: number;
  analysis?: {
    profit: number; marginPercent: number; roiPercent: number;
    purchaseCost: number; taxAmount: number; commissionAmount: number;
    saleFeeAmount: number; operatingCost: number; amountReceived: number;
  };
  quote?: { commissionPercent: number; fixedFee: number; saleFeeAmount: number; shippingCost: number; logisticType: string; freeShipping: boolean; mandatoryFreeShippingApplied?: boolean; shippingGrossReference?: number };
  comparison?: {
    price: number;
    selected: { listingType: string; saleFeeAmount: number; shippingCost: number; profit: number };
    alternative: { listingType: string; saleFeeAmount: number; shippingCost: number; profit: number };
    cheaperPlan: string; observation: string;
  } | null;
  error?: string;
};

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

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
  const [confirmedFacts, setConfirmedFacts] = useState("");
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [units, setUnits] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [operatingCost, setOperatingCost] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [manualCategory, setManualCategory] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [listingType, setListingType] = useState<"CLASSIC" | "PREMIUM">("CLASSIC");
  const [logisticType, setLogisticType] = useState("");
  const [shippingPreferences, setShippingPreferences] = useState<ShippingPreferences | null>(null);
  const [shippingError, setShippingError] = useState("");
  const [freeShipping, setFreeShipping] = useState<"" | "true" | "false">("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState<"discover" | "price" | null>(null);
  const [error, setError] = useState("");
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiTestStatus, setAiTestStatus] = useState("");
  const [aiTesting, setAiTesting] = useState(false);
  const [restoredMissingFacts, setRestoredMissingFacts] = useState<string[]>([]);
  const [savedTitle, setSavedTitle] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const shippingDetails = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ml/seller-shipping", { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Falha ao consultar logística.");
        return body as ShippingPreferences;
      })
      .then(prefs => {
        if (!active) return;
        setShippingPreferences(prefs);
        setLogisticType(current => current && prefs.choices.some(x => x.type === current)
          ? current : prefs.defaultType ?? "");
        if (!prefs.verified) setShippingError(prefs.notice ?? "Logística não confirmada.");
      })
      .catch(error => { if (active) setShippingError(error instanceof Error ? error.message : "Erro de logística."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/status", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível obter o status da IA.");
        return r.json() as Promise<AiConfig>;
      })
      .then((result) => { if (active) setAiConfig(result); })
      .catch(() => { if (active) setAiTestStatus("Não foi possível consultar o status. Verifique sua sessão no Radar."); });
    return () => { active = false; };
  }, []);

  async function testGemini() {
    setAiTestStatus("");
    setAiTesting(true);
    try {
      const result = await postJson<{ message: string }>("/api/ai/status", {});
      setAiTestStatus(result.message);
    } catch (err) {
      setAiTestStatus(err instanceof Error ? err.message : "Não foi possível testar a conexão.");
    } finally {
      setAiTesting(false);
    }
  }

  // The catalog's verified identity takes precedence over a barcode.
  const effectiveName = discovery?.identification?.verified && discovery.identification.name
    ? discovery.identification.name
    : name;
  const inputIsBarcodeOnly = /^\d{8,14}$/.test(name.replace(/\D/g, ""));
  const unresolvedBarcode = inputIsBarcodeOnly && !discovery?.identification?.verified;

  // This is a deterministic preview, NOT model-generated ad copy.
  const draftTitle = useMemo(() => {
    const base = effectiveName.trim().replace(/\s+/g, " ");
    const manufacturer = brand.trim();
    return (manufacturer && !base.toLowerCase().includes(manufacturer.toLowerCase())
      ? manufacturer + " " + base
      : base).slice(0, 120);
  }, [effectiveName, brand]);

  async function generateAiDraft() {
    if (unresolvedBarcode) {
      setError("O EAN sozinho não identifica o produto. Informe o nome comercial ou confirme um resultado do catálogo antes de gerar.");
      return;
    }
    if (effectiveName.trim().length < 3) {
      setError("Informe o nome do produto antes de gerar o texto.");
      return;
    }
    setError("");
    setAiDraft(null);
    setAiLoading(true);
    try {
      const result = await postJson<AiDraft>("/api/ai/listing-draft", {
        name: effectiveName.trim(),
        brand: brand.trim(),
        category: categoryName,
        confirmedFacts: confirmedFacts.trim(),
        catalogProductId: discovery?.identification?.catalogProductId || undefined,
      });
      setAiDraft(result);
      setSavedTitle(result.title);
      setSavedDescription(result.description);
      setRestoredMissingFacts(result.missingFacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o anúncio com IA.");
    } finally {
      setAiLoading(false);
    }
  }

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
    setAiDraft(null);
    setCategoryId("");
    setCategoryName("");
    setManualCategory(false);
    try {
      const data = await postJson<Discovery>("/api/ml/product-discovery", { query: name.trim() });
      setDiscovery(data);
      if (data.identification?.brand && !brand.trim()) setBrand(data.identification.brand);
      setCategoryId(data.identification?.categoryId ?? "");
      setCategoryName(data.identification?.categoryName ?? "");
      setManualCategory(!data.identification?.categoryId);
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
    if (!categoryId || !cost || !kitQuantity || !Number.isInteger(kitQuantity) || operating === null || discountPercent === null) {
      shippingDetails.current?.setAttribute("open", "");
      setError("Confirme categoria, custo por unidade, unidades do kit e custos. O custo operacional já inicia em R$ 0,00.");
      return;
    }
    if (!logisticType || !shippingPreferences?.verified ||
        !shippingPreferences.choices.some(x => x.type === logisticType)) {
      shippingDetails.current?.setAttribute("open", "");
      setError("A logística da conta vendedora ainda não foi confirmada. Confira a conexão Mercado Livre.");
      return;
    }
    if (freeShipping === "" || weightGrams === null || heightCm === null || widthCm === null || lengthCm === null) {
      shippingDetails.current?.setAttribute("open", "");
      setError("Para cotar frete e sugerir preço, confirme frete grátis e medidas reais. Peso em gramas: use 100, não 0,100.");
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
        logisticType,
        freeShipping: freeShipping === "true",
        weightGrams,
        heightCm,
        widthCm,
        lengthCm,
      });
      setPrice(result);
      if (result.quote?.freeShipping === true) setFreeShipping("true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cotar as tarifas.");
    } finally {
      setLoading(null);
    }
  }

  const label = (text: string, value: string, onChange: (v: string) => void, placeholder = "", required = false) =>
    <label className="field listing-assistant__field">
      <span>{text}</span>
      <input value={value} onChange={(event) => { onChange(event.target.value); setPrice(null); }} placeholder={placeholder} required={required} />
    </label>;

  return (
    <div className="listing-assistant">
      <header className="listing-assistant__header">
        <p className="page-kicker">Operação / Novo anúncio</p>
        <h1>Assistente de anúncios</h1>
        <p>Do produto à decisão de venda. Identifique oportunidades, confira os custos da sua operação e revise o texto gerado com IA, sem publicar nada automaticamente.</p>
      </header>
      <div className="listing-assistant__steps" aria-label="Etapas do assistente">
        <span><b>01</b> Produto</span>
        <span><b>02</b> Precificação</span>
        <span><b>03</b> Revisão</span>
      </div>
      {fromExtension && (
        <div className="listing-assistant__origin">
          <div><strong>Produto enviado pela extensão</strong>
          <p>Use a leitura como ponto de partida; confirme marca, variação, quantidade e embalagem. {/^MLB(?:U)?\d{5,}$/.test(initialReference) ? "Referência observada: " + initialReference : ""}</p></div>
        </div>
      )}
      <div className="listing-assistant__layout">
        <div className="listing-assistant__main">
      <section className="panel listing-assistant__section">
        <div className="listing-assistant__section-heading">
          <span className="listing-assistant__step-number">01</span>
          <div><h2>Identificar produto</h2><p>Encontre a categoria e uma referência de mercado.</p></div>
        </div>
        <form onSubmit={identify} className="listing-assistant__form">
          {label("Nome ou EAN do produto", name, (v) => { setName(v); setAiDraft(null); setSavedTitle(""); setSavedDescription(""); setRestoredMissingFacts([]); setDiscovery(null); setCategoryId(""); setCategoryName(""); setPrice(null); }, "Ex.: tinta pinta couro Shake Paint 37 ml", true)}
          <div className="listing-assistant__grid">
            {label("Marca confirmada (opcional)", brand, (v) => { setBrand(v); setAiDraft(null); }, "Ex.: Acrilex")}
            {label("SKU interno (opcional)", sku, setSku, "Seu código de estoque")}
          </div>
          <button type="submit" className="primary listing-assistant__button" disabled={loading !== null}>
            {loading === "discover" ? "Consultando catálogo e mercado…" : "Identificar produto e categoria"}
          </button>
        </form>
        {discovery && (
          <div className="listing-assistant__discovery" role="status">
            <h3>Resultado da identificação</h3>
            {discovery.notice && <p className="listing-assistant__identity-warning" role="alert">{discovery.notice}</p>}
            {discovery.categoryNotice && <p className="listing-assistant__identity-warning">{discovery.categoryNotice}</p>}
            {discovery.catalogStrategy && (
              <div className="listing-assistant__catalog-decision">
                <strong>Estratégia: catálogo ou anúncio tradicional?</strong>
                <p className="listing-assistant__helper">
                  {discovery.catalogStrategy.recommendation === "CATALOG_REQUIRED"
                    ? "Catálogo obrigatório — anúncio tradicional bloqueado"
                    : discovery.catalogStrategy.recommendation === "COMPARE"
                    ? "Catálogo encontrado — comparar antes de escolher"
                    : "Decisão pendente — não publicar automaticamente no catálogo"}
                </p>
                <p>{discovery.catalogStrategy.reason}</p>
                {discovery.catalogStrategy.productId && <p><strong>Referência:</strong> {discovery.catalogStrategy.productId} · <strong>Oferta observada:</strong> {money(discovery.catalogStrategy.competitionPrice)}</p>}
                <details>
                  <summary>Limitações e cuidados com o catálogo</summary>
                  <ul>{discovery.catalogStrategy.restrictions.map(x => <li key={x}>{x}</li>)}</ul>
                </details>
                <p className="listing-assistant__helper">A publicação por catálogo não é habilitada neste fluxo. Somente a API do Mercado Livre pode confirmar a elegibilidade e a estratégia obrigatória.</p>
              </div>
            )}
            {discovery.identification?.verified && discovery.identification.name && (
              <p className="listing-assistant__identity-success"><strong>Produto encontrado:</strong> {discovery.identification.name}</p>
            )}
            {!discovery.identification?.requiresProductName && <p>Categoria sugerida pelo Mercado Livre. Confirme antes da precificação; isto não certifica o produto.</p>}
            {(discovery.categorySuggestions?.length ?? 0) > 1 && (
              <p className="listing-assistant__helper">
                Selecione a categoria que descreve o produto real. Quando o catálogo traz uma referência, ela aparece identificada. Se houver dúvida, não publique.
              </p>
            )}
            {(discovery.categorySuggestions?.length ?? 0) > 0 && (
              <label className="field listing-assistant__field">
                <span>Escolha a categoria correta</span>
                <select value={manualCategory ? "manual" : categoryId} onChange={(event) => {
                  const id = event.target.value;
                  setPrice(null);
                  if (id === "manual") {
                    setManualCategory(true);
                    setCategoryId("");
                    setCategoryName("");
                  } else {
                    const selected = discovery.categorySuggestions?.find((option) => option.categoryId === id);
                    setManualCategory(false);
                    setCategoryId(id);
                    setCategoryName(selected?.categoryName ?? "");
                  }
                }}>
                  <option value="">Selecione</option>
                  {discovery.categorySuggestions?.map((item) => <option key={item.categoryId} value={item.categoryId}>{item.path || item.categoryName} ({item.categoryId})
                    {item.source === "CATALOG" ? " · referência catálogo" : " · sugestão automática"}
                    {item.listingAllowed === false ? " · publicação indisponível" : ""}</option>)}
                  <option value="manual">Informar outro ID</option>
                </select>
              </label>
            )}
            {!discovery.identification?.requiresProductName && <p>Comparáveis encontrados: {discovery.market?.comparableCount ?? "indisponível"}. Mediana de preços observados: <strong>{money(discovery.market?.medianPrice)}</strong>. Comparabilidade e período precisam de validação; isso não representa vendas garantidas.</p>}
            {discovery.dimensions && <p>Foram observadas medidas de referência no catálogo, mas não serão copiadas automaticamente. Confirme o peso e as dimensões da sua embalagem.</p>}
            {manualCategory && label("ID de categoria confirmada", categoryId, (v) => { setCategoryId(v); setCategoryName(""); }, "Ex.: MLB1234")}
          </div>
        )}
      </section>
      <section className="panel listing-assistant__section">
        <div className="listing-assistant__section-heading">
          <span className="listing-assistant__step-number">02</span>
          <div><h2>Custos e frete</h2><p>Comece pelo custo. Abra os detalhes apenas quando for cotar.</p></div>
        </div>
        <div className="listing-assistant__grid">
          {label("Custo de compra por unidade (R$)", purchaseCost, setPurchaseCost, "Ex.: 7,50")}
          {label("Unidades por kit", units, setUnits)}
        </div>
        <details ref={shippingDetails} className="listing-assistant__package listing-assistant__advanced">
          <summary>Frete, embalagem e custos adicionais <small>Obrigatórios para cotação</small></summary>
          <p className="listing-assistant__helper">Preencha só os dados reais. A modalidade de logística deve corresponder à habilitada na sua conta; não é uma lista de opções garantidas. O valor do frete é uma estimativa pré-venda, não uma cobrança realizada.</p>
          <div className="listing-assistant__grid">
          {label("Desconto do fornecedor (%)", discount, setDiscount)}
          {label("Custo operacional por venda (R$)", operatingCost, setOperatingCost, "Informe inclusive 0")}
          <label className="field listing-assistant__field">Modalidade
            <select value={listingType} onChange={e => { setListingType(e.target.value as "CLASSIC" | "PREMIUM"); setPrice(null); }}>
              <option value="CLASSIC">Clássico</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </label>
          <label className="field listing-assistant__field">Sua logística
            <select value={logisticType} disabled={!shippingPreferences?.verified} onChange={(e) => { setLogisticType(e.target.value); setPrice(null); }}>
              <option value="">Aguardando confirmação da conta</option>
              {shippingPreferences?.choices.map(option =>
                <option key={option.type} value={option.type}>{option.label}</option>
              )}
            </select>
          </label>
          <label className="field listing-assistant__field">O anúncio oferece frete grátis?
            <select value={freeShipping} onChange={(e) => { setFreeShipping(e.target.value as "" | "true" | "false"); setPrice(null); }}>
              <option value="">Escolha para cotar</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
          </div>
          <p className="listing-assistant__helper" role="status">
            {shippingError || shippingPreferences?.notice || "Consultando as modalidades habilitadas do vendedor…"}
          </p>
          <h3 className="listing-assistant__subheading">Medidas da embalagem para frete</h3>
          <div className="listing-assistant__grid">
            {label("Peso real, em gramas", weight, setWeight)}
            {label("Altura em cm", height, setHeight)}
            {label("Largura em cm", width, setWidth)}
            {label("Comprimento em cm", length, setLength)}
          </div>
        </details>
        <button type="button" onClick={simulatePrice} className="primary listing-assistant__button" disabled={loading !== null || !discovery}>
          {loading === "price" ? "Cotando tarifas e frete…" : "Calcular preço e lucro"}
        </button>
        {!discovery && <p className="listing-assistant__helper">Identifique o produto na primeira etapa para liberar a cotação.</p>}
      </section>
        </div>
        <aside className="listing-assistant__aside" aria-label="Prévia do anúncio">
      {error && <p role="alert" className="listing-assistant__error">{error}</p>}
      <section className="panel listing-assistant__section">
        <div className="listing-assistant__section-heading">
          <span className="listing-assistant__step-number">03</span>
          <div><h2>Prévia para revisão</h2><p>Confira o anúncio antes de qualquer publicação.</p></div>
        </div>
        <label className="field listing-assistant__field">
          <span>Características confirmadas do produto (opcional)</span>
          <textarea
            maxLength={1500}
            value={confirmedFacts}
            onChange={(e) => { setConfirmedFacts(e.target.value); setAiDraft(null); }}
            placeholder="Ex.: embalagem original com 37 ml, cor preta, produto novo. Informe somente fatos verificados."
          />
        </label>

        <div className="listing-assistant__ai-status" role="status">
          <span className={"listing-assistant__status-dot" + (aiConfig?.configured ? " is-ready" : "")} aria-hidden="true" />
          <span>{aiConfig?.message ?? "Verificando Gemini no servidor…"}</span>
        </div>
        <button type="button" className="secondary listing-assistant__button" onClick={testGemini} disabled={!aiConfig?.configured || aiTesting}>
          {aiTesting ? "Testando conexão…" : "Testar conexão Gemini"}
        </button>
        {aiTestStatus && <p className="listing-assistant__helper" role="status">{aiTestStatus}</p>}
        <button type="button" className="primary listing-assistant__button" disabled={aiLoading || loading !== null || effectiveName.trim().length < 3 || unresolvedBarcode || !aiConfig?.configured} onClick={generateAiDraft}>
          {aiLoading ? "Gerando título e descrição…" : "Gerar título e descrição com Gemini"}
        </button>
        <div className="listing-assistant__draft">
          {unresolvedBarcode && <p className="listing-assistant__identity-warning">Antes da IA, confirme o nome do produto. Código de barras e categoria não bastam para descrever o item.</p>}
          <span className="listing-assistant__preview-label">Título para revisão</span>
          <div className="listing-assistant__preview-title">{aiDraft?.title || savedTitle || draftTitle || "Aguardando produto"}</div>
        {aiDraft && (
          <div className="listing-assistant__stack">
            <span className="listing-assistant__preview-label">Descrição sugerida pela IA</span>
            <div className="listing-assistant__copy">{aiDraft.description}</div>
            {aiDraft.missingFacts.length > 0 && <p className="listing-assistant__facts"><strong>Informações a confirmar:</strong> {aiDraft.missingFacts.join("; ")}</p>}
            <p className="listing-assistant__note">{aiDraft.verifiedSource ? `Conteúdo baseado em ${aiDraft.verifiedFactsCount ?? 0} atributos consultados no catálogo do Mercado Livre e dados informados. Revise antes de usar.` : "Nenhuma ficha técnica verificada foi encontrada. O texto contém apenas informações fornecidas e precisa de revisão."} Nenhuma imagem é gerada nem anúncio publicado.</p>
          </div>
        )}
        <div className="listing-assistant__meta">
          <div><span>Categoria</span><strong>{categoryName || categoryId || "Aguardando identificação"}</strong></div>
          <div><span>SKU</span><strong>{sku.trim() || "Não informado"}</strong></div>
          <div><span>Preço sugerido</span><strong>{money(price?.suggestedPrice)}</strong></div>
        </div>
        {price?.analysis && (
          <div className="listing-assistant__finance">
            <div className="listing-assistant__finance-head">
              <div><span>Lucro estimado</span><strong>{money(price.analysis.profit)}</strong></div>
              <div><span>Margem</span><strong>{price.analysis.marginPercent.toFixed(2)}%</strong></div>
              <div><span>ROI</span><strong>{price.analysis.roiPercent.toFixed(2)}%</strong></div>
            </div>
            <p>Mercadoria {money(price.analysis.purchaseCost)} · Tarifa total ML {money(price.quote?.saleFeeAmount)} (inclui tarifa fixa {money(price.quote?.fixedFee)}) · Frete {money(price.quote?.shippingCost)} · Imposto {money(price.analysis.taxAmount)} · Operação {money(price.analysis.operatingCost)}.</p>
            <p>Cotação estimada para {price.quote?.logisticType || "logística informada"}, frete grátis {price.quote?.freeShipping ? "sim" : "não"}. O valor efetivo depende da venda e das regras da sua conta.</p>
            {price.quote?.mandatoryFreeShippingApplied && (
              <p className="listing-assistant__identity-warning">O frete grátis foi aplicado automaticamente porque o preço sugerido atingiu a faixa de obrigação. A cotação é estimada, conforme regras e elegibilidade.</p>
            )}
            {price.comparison ? (
              <div className="listing-assistant__compare">
                <strong>Clássico × Premium, mesmo preço {money(price.comparison.price)}</strong>
                {[price.comparison.selected, price.comparison.alternative].map(x => (
                  <p key={x.listingType}>
                    <b>{x.listingType === "CLASSIC" ? "Clássico" : "Premium"}:</b>
                    {" "}tarifa {money(x.saleFeeAmount)} · frete {money(x.shippingCost)} ·
                    lucro {money(x.profit)}
                  </p>
                ))}
                <small>{price.comparison.observation}</small>
              </div>
            ) : <p className="listing-assistant__helper">A comparação entre modalidades não ficou disponível na API; não foi estimada.</p>}
            <p className="listing-assistant__helper">Tarifa: API de listing prices. Frete: cotação por vendedor, já com descontos informados pela API. Valor realizado somente após a venda.</p>
          </div>
        )}
        <ListingDraftManager
          data={{
            name: effectiveName,
            barcode: /^\d{8,14}$/.test(name.trim()) ? name.trim() : null,
            brand, sku, categoryId, categoryName,
            catalogProductId: discovery?.identification?.catalogProductId ?? null,
            publicationChannel: "TRADITIONAL",
            catalogExactMatchConfirmed: false,
            title: aiDraft?.title || savedTitle || draftTitle,
            description: aiDraft?.description || savedDescription || "",
            confirmedFacts,
            missingFacts: aiDraft?.missingFacts ?? restoredMissingFacts,
            factsReviewed: false,
            imageUrls: [], stock: 0, attributes: {},
            costPerUnit: positiveNumber(purchaseCost),
            kitQuantity: Number(units) || 1,
            discountPercent: nonnegativeNumber(discount) ?? 0,
            operatingCost: nonnegativeNumber(operatingCost) ?? 0,
            listingType, logisticType,
            freeShipping: freeShipping === "" ? null : freeShipping === "true",
            weightGrams: positiveNumber(weight),
            heightCm: positiveNumber(height),
            widthCm: positiveNumber(width),
            lengthCm: positiveNumber(length),
            suggestedPrice: price?.suggestedPrice ?? null,
            profit: price?.analysis?.profit ?? null,
            marginPercent: price?.analysis?.marginPercent ?? null,
          } satisfies DraftValues}
          onRestore={data => {
            setName(data.name);
            setBrand(data.brand);
            setSku(data.sku);
            setCategoryId(data.categoryId);
            setCategoryName(data.categoryName);
            setConfirmedFacts(data.confirmedFacts);
            setPurchaseCost(data.costPerUnit == null ? "" : String(data.costPerUnit));
            setUnits(String(data.kitQuantity));
            setDiscount(String(data.discountPercent));
            setOperatingCost(String(data.operatingCost));
            setWeight(data.weightGrams == null ? "" : String(data.weightGrams));
            setHeight(data.heightCm == null ? "" : String(data.heightCm));
            setWidth(data.widthCm == null ? "" : String(data.widthCm));
            setLength(data.lengthCm == null ? "" : String(data.lengthCm));
            setListingType(data.listingType);
            setLogisticType(data.logisticType);
            setFreeShipping(data.freeShipping === null ? "" : data.freeShipping ? "true" : "false");
            setDiscovery({ identification: {
              name: data.name, categoryId: data.categoryId,
              categoryName: data.categoryName, catalogProductId: data.catalogProductId,
              source: "SAVED", verified: Boolean(data.catalogProductId),
            }});
            setPrice(null);
            setAiDraft(null);
            setSavedTitle(data.title);
            setSavedDescription(data.description);
            setRestoredMissingFacts(data.missingFacts);
            setError("");
          }}
        />
        <div className="listing-assistant__disclaimer listing-assistant__stack">
          <p className="listing-assistant__note"><strong>Etapa de preparação:</strong> imagens reais, atributos obrigatórios, estoque e validação de publicação ainda precisam ser concluídos. Nenhum anúncio é publicado ou alterado nesta versão.</p>
          <p className="listing-assistant__note">A IA sugere texto; preço e custos vêm do motor financeiro e das APIs do Radar, sujeitos à conferência.</p>
        </div>
        </div>
      </section>
        </aside>
      </div>
    </div>
  );
}
