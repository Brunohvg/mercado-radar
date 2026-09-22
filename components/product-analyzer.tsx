"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  analyzeProfitability,
  type ListingType,
  type ProfitabilityResult,
} from "@/lib/profitability";

type FormState = {
  productName: string;
  supplierName: string;
  supplierPrice: string;
  discountPercent: string;
  kitQuantity: string;
  salePrice: string;
  listingType: ListingType;
  commissionPercent: string;
  fixedFee: string;
  shippingCost: string;
  operatingCost: string;
  targetMarginPercent: string;
  targetRoiPercent: string;
  categoryId: string;
  weightGrams: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
};

type MlQuote = {
  listingType: ListingType;
  commissionPercent: number;
  fixedFee: number;
  saleFeeAmount: number;
  shippingCost: number;
  billableWeight: number;
  shippingDiscountRate: number;
  shippingPromotedAmount: number;
};

type ComparedQuote = MlQuote & {
  analysis: ProfitabilityResult;
};

type CategorySuggestion = {
  domainId: string | null;
  domainName: string | null;
  categoryId: string;
  categoryName: string;
};

const initial: FormState = {
  productName: "",
  supplierName: "",
  supplierPrice: "",
  discountPercent: "0",
  kitQuantity: "1",
  salePrice: "",
  listingType: "CLASSIC",
  commissionPercent: "0",
  fixedFee: "0",
  shippingCost: "0",
  operatingCost: "0",
  targetMarginPercent: "20",
  targetRoiPercent: "30",
  categoryId: "",
  weightGrams: "",
  heightCm: "",
  widthCm: "",
  lengthCm: "",
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function verdictLabel(verdict: ProfitabilityResult["verdict"]) {
  if (verdict === "GOOD") return "COMPENSA TESTAR";
  if (verdict === "TIGHT") return "MARGEM APERTADA";
  return "NÃO COMPENSA";
}

function number(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInput(form: FormState, override?: Partial<{
  listingType: ListingType;
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  kitQuantity: number;
  salePrice: number;
}>) {
  return {
    productName: form.productName,
    supplierPrice: number(form.supplierPrice),
    discountPercent: number(form.discountPercent),
    kitQuantity: override?.kitQuantity ?? number(form.kitQuantity),
    salePrice: override?.salePrice ?? number(form.salePrice),
    listingType: override?.listingType ?? form.listingType,
    commissionPercent:
      override?.commissionPercent ?? number(form.commissionPercent),
    fixedFee: override?.fixedFee ?? number(form.fixedFee),
    shippingCost: override?.shippingCost ?? number(form.shippingCost),
    operatingCost: number(form.operatingCost),
    targetMarginPercent: number(form.targetMarginPercent),
    targetRoiPercent: number(form.targetRoiPercent),
  };
}

export function ProductAnalyzer() {
  const [form, setForm] = useState<FormState>(initial);
  const [analysis, setAnalysis] = useState<ProfitabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [comparison, setComparison] = useState<ComparedQuote[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [categorySuggestion, setCategorySuggestion] =
    useState<CategorySuggestion | null>(null);

  const tone = useMemo(() => {
    if (!analysis) return "neutral";
    return analysis.verdict === "GOOD"
      ? "good"
      : analysis.verdict === "TIGHT"
        ? "tight"
        : "bad";
  }, [analysis]);

  const hasCoreInputs =
    number(form.supplierPrice) > 0 && number(form.salePrice) > 0;

  const currentPreview = useMemo(
    () => (hasCoreInputs ? analyzeProfitability(toInput(form)) : null),
    [form, hasCoreInputs],
  );

  const maxNetPurchase = Math.max(
    0,
    number(form.salePrice) -
      (number(form.salePrice) * number(form.commissionPercent)) / 100 -
      number(form.fixedFee) -
      number(form.shippingCost) -
      number(form.operatingCost) -
      (number(form.salePrice) * number(form.targetMarginPercent)) / 100,
  );

  const discountFactor = 1 - number(form.discountPercent) / 100;
  const qty = Math.max(1, number(form.kitQuantity));
  const maxSupplierUnit =
    discountFactor > 0 ? maxNetPurchase / qty / discountFactor : 0;

  const kitRows = useMemo(() => {
    if (!hasCoreInputs) return [];

    const basePrice = number(form.salePrice);
    const discounts: Record<number, number> = {
      1: 1,
      2: 0.97,
      3: 0.94,
      5: 0.91,
      10: 0.88,
    };

    return [1, 2, 3, 5, 10].map((kitQuantity) =>
      analyzeProfitability(
        toInput(form, {
          kitQuantity,
          salePrice: basePrice * kitQuantity * discounts[kitQuantity],
        }),
      ),
    );
  }, [form, hasCoreInputs]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function runAnalysis(nextForm = form) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toInput(nextForm)),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Falha ao analisar produto");
    }

    setAnalysis(payload.analysis);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await runAnalysis();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao analisar",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchMlQuote(listingType: ListingType): Promise<MlQuote> {
    const response = await fetch("/api/ml/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salePrice: number(form.salePrice),
        categoryId: form.categoryId.trim(),
        listingType,
        weightGrams: number(form.weightGrams),
        heightCm: number(form.heightCm),
        widthCm: number(form.widthCm),
        lengthCm: number(form.lengthCm),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload.error ?? "Falha ao consultar custos do Mercado Livre.",
      );
    }

    return payload;
  }

  async function detectCategory() {
    setCategoryLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const response = await fetch("/api/ml/category-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.productName }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao detectar categoria.");
      }

      const best = payload.best as CategorySuggestion | null;
      if (!best) {
        throw new Error("Nenhuma categoria sugerida para esse produto.");
      }

      setCategorySuggestion(best);
      field("categoryId", best.categoryId);
      setQuoteMessage(
        `Categoria sugerida: ${best.categoryName} (${best.categoryId}).`,
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao detectar categoria.",
      );
    } finally {
      setCategoryLoading(false);
    }
  }

  async function suggestPrice() {
    setPriceLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const response = await fetch("/api/ml/suggest-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: form.productName,
          supplierPrice: number(form.supplierPrice),
          discountPercent: number(form.discountPercent),
          kitQuantity: number(form.kitQuantity),
          listingType: form.listingType,
          categoryId: form.categoryId.trim(),
          weightGrams: number(form.weightGrams),
          heightCm: number(form.heightCm),
          widthCm: number(form.widthCm),
          lengthCm: number(form.lengthCm),
          operatingCost: number(form.operatingCost),
          targetMarginPercent: number(form.targetMarginPercent),
          targetRoiPercent: number(form.targetRoiPercent),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao sugerir preço.");
      }

      const next = {
        ...form,
        salePrice: Number(payload.suggestedPrice).toFixed(2),
        commissionPercent: Number(payload.quote.commissionPercent).toFixed(2),
        fixedFee: Number(payload.quote.fixedFee).toFixed(2),
        shippingCost: Number(payload.quote.shippingCost).toFixed(2),
      };

      setForm(next);
      setAnalysis(payload.analysis);
      setQuoteMessage(
        `Preço sugerido pelo Radar: ${money.format(payload.suggestedPrice)} com tarifa e frete reais da sua conta.`,
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error ? caught.message : "Falha ao sugerir preço.",
      );
    } finally {
      setPriceLoading(false);
    }
  }

  async function applyMlQuote() {
    setQuoteLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const quote = await fetchMlQuote(form.listingType);
      const next = {
        ...form,
        commissionPercent: quote.commissionPercent.toFixed(2),
        fixedFee: quote.fixedFee.toFixed(2),
        shippingCost: quote.shippingCost.toFixed(2),
      };

      setForm(next);
      await runAnalysis(next);
      setQuoteMessage(
        "Tarifa e frete da API aplicados à análise atual.",
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao consultar Mercado Livre.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  async function compareListingTypes() {
    setQuoteLoading(true);
    setQuoteMessage("");
    setComparison([]);

    try {
      const [classic, premium] = await Promise.all([
        fetchMlQuote("CLASSIC"),
        fetchMlQuote("PREMIUM"),
      ]);

      const enrich = (quote: MlQuote): ComparedQuote => ({
        ...quote,
        analysis: analyzeProfitability(
          toInput(form, {
            listingType: quote.listingType,
            commissionPercent: quote.commissionPercent,
            fixedFee: quote.fixedFee,
            shippingCost: quote.shippingCost,
          }),
        ),
      });

      setComparison([enrich(classic), enrich(premium)]);
      setQuoteMessage(
        "Comparação carregada com custos da sua conta.",
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao comparar anúncios.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  function useComparedQuote(item: ComparedQuote) {
    const next = {
      ...form,
      listingType: item.listingType,
      commissionPercent: item.commissionPercent.toFixed(2),
      fixedFee: item.fixedFee.toFixed(2),
      shippingCost: item.shippingCost.toFixed(2),
    };

    setForm(next);
    setAnalysis(item.analysis);
  }

  return (
    <section className="analyzer" id="analisar">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Analisador de produto</p>
          <h2>Preço, frete, comissão e margem em uma conta só.</h2>
        </div>
        <p>
          Informe o produto e seu custo. O Radar pode detectar a categoria,
          consultar os custos da sua conta e sugerir um preço de venda saudável.
        </p>
      </div>

      <div className="analyzer-grid">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="field wide">
            <label>Produto</label>
            <input
              placeholder="Ex.: Ilhós nº54 alumínio pacote 1.000 unidades"
              value={form.productName}
              onChange={(e) => field("productName", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Fornecedor <span className="optional-label">opcional</span></label>
            <input
              placeholder="Ex.: Distribuidora X"
              value={form.supplierName}
              onChange={(e) => field("supplierName", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Preço de compra / tabela</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={form.supplierPrice}
              onChange={(e) => field("supplierPrice", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Desconto do fornecedor %</label>
            <input
              type="number"
              step="0.01"
              value={form.discountPercent}
              onChange={(e) => field("discountPercent", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Quantidade no kit</label>
            <input
              type="number"
              min="1"
              value={form.kitQuantity}
              onChange={(e) => field("kitQuantity", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Preço de venda</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Pode ser sugerido pelo Radar"
              value={form.salePrice}
              onChange={(e) => field("salePrice", e.target.value)}
            />
            <small className="field-hint neutral">
              Deixe vazio para usar a sugestão baseada nos custos reais do Mercado Livre.
            </small>
          </div>

          <div className="field">
            <label>Tipo de anúncio</label>
            <select
              value={form.listingType}
              onChange={(e) =>
                field("listingType", e.target.value as ListingType)
              }
            >
              <option value="CLASSIC">Clássico</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
          <div className="field">
            <label>Comissão variável %</label>
            <input
              type="number"
              step="0.01"
              value={form.commissionPercent}
              onChange={(e) =>
                field("commissionPercent", e.target.value)
              }
            />
          </div>
          <div className="field">
            <label>Tarifa fixa</label>
            <input
              type="number"
              step="0.01"
              value={form.fixedFee}
              onChange={(e) => field("fixedFee", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Seu custo de frete</label>
            <input
              type="number"
              step="0.01"
              value={form.shippingCost}
              onChange={(e) => field("shippingCost", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Custo operacional</label>
            <input
              type="number"
              step="0.01"
              value={form.operatingCost}
              onChange={(e) => field("operatingCost", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Meta de margem %</label>
            <input
              type="number"
              step="0.01"
              value={form.targetMarginPercent}
              onChange={(e) =>
                field("targetMarginPercent", e.target.value)
              }
            />
          </div>
          <div className="field">
            <label>Meta de ROI %</label>
            <input
              type="number"
              step="0.01"
              value={form.targetRoiPercent}
              onChange={(e) => field("targetRoiPercent", e.target.value)}
            />
          </div>

          {number(form.salePrice) > 0 ? (
            <div className="purchase-limit wide">
              <div>
                <span>Custo líquido máximo do kit</span>
                <strong>{money.format(maxNetPurchase)}</strong>
              </div>
              <div>
                <span>Preço máximo no fornecedor por unidade</span>
                <strong>{money.format(maxSupplierUnit)}</strong>
              </div>
              <small>
                Limite calculado para manter {form.targetMarginPercent}% de
                margem com os custos atuais.
              </small>
            </div>
          ) : (
            <div className="purchase-limit wide empty-limit">
              <div>
                <span>Preço de venda</span>
                <strong>Será sugerido</strong>
              </div>
              <small>
                Detecte a categoria, informe peso e dimensões e use “Sugerir preço”.
              </small>
            </div>
          )}

          {error && <div className="error wide">{error}</div>}

          <button
            className="primary wide"
            disabled={loading || !hasCoreInputs || !form.productName.trim()}
          >
            {loading ? "Calculando..." : "Analisar rentabilidade"}
          </button>
        </form>

        <div className={"panel result-panel " + tone}>
          {!analysis ? (
            <div className="empty-result">
              <span className="radar">◎</span>
              <h3>{currentPreview ? "Prévia pronta" : "Comece pelo produto"}</h3>
              <p>
                {currentPreview
                  ? `Com os números atuais: margem ${currentPreview.marginPercent.toFixed(1)}% e ROI ${currentPreview.roiPercent.toFixed(1)}%.`
                  : "Informe nome e custo. O Radar completa os dados do Mercado Livre e pode sugerir o preço."}
              </p>
            </div>
          ) : (
            <>
              <div className="verdict">
                <span>Resultado</span>
                <strong>{verdictLabel(analysis.verdict)}</strong>
              </div>

              <div className="hero-number">
                <span>Lucro estimado por venda</span>
                <strong>{money.format(analysis.profit)}</strong>
              </div>

              <div className="result-grid">
                <div>
                  <span>Custo unitário</span>
                  <strong>{money.format(analysis.unitCost)}</strong>
                </div>
                <div>
                  <span>Custo do kit</span>
                  <strong>{money.format(analysis.purchaseCost)}</strong>
                </div>
                <div>
                  <span>Comissão ML</span>
                  <strong>{money.format(analysis.commissionAmount)}</strong>
                </div>
                <div>
                  <span>Recebe do ML</span>
                  <strong>{money.format(analysis.amountReceived)}</strong>
                </div>
                <div>
                  <span>Margem</span>
                  <strong>{analysis.marginPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>ROI</span>
                  <strong>{analysis.roiPercent.toFixed(1)}%</strong>
                </div>
              </div>

              <div className="recommendation">
                <span>Preço mínimo para suas metas</span>
                <strong>
                  {money.format(analysis.minimumSuggestedPrice)}
                </strong>
                <small>
                  Ponto de equilíbrio:{" "}
                  {money.format(analysis.breakEvenPrice)} · ML deixa{" "}
                  {analysis.receivedPercent.toFixed(1)}% do preço antes
                  do custo do produto.
                </small>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="ml-quote-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Custos reais da conta</p>
            <h2>Consultar Mercado Livre</h2>
          </div>
          <p>
            Categoria e custos vêm do Mercado Livre. Peso e dimensões precisam
            corresponder à embalagem real para o frete não ser estimado errado.
          </p>
        </div>

        <div className="quote-fields">
          <div className="field category">
            <label>Categoria ML</label>
            <input
              placeholder="Detecte pela descrição ou informe o ID"
              value={form.categoryId}
              onChange={(e) => field("categoryId", e.target.value.trim())}
            />
            {categorySuggestion && (
              <small className="field-hint">
                {categorySuggestion.categoryName}
                {categorySuggestion.domainName
                  ? ` · ${categorySuggestion.domainName}`
                  : ""}
              </small>
            )}
          </div>
          <div className="field">
            <label>Peso (g)</label>
            <input
              type="number"
              value={form.weightGrams}
              onChange={(e) => field("weightGrams", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Altura (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.heightCm}
              onChange={(e) => field("heightCm", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Largura (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.widthCm}
              onChange={(e) => field("widthCm", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Comprimento (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.lengthCm}
              onChange={(e) => field("lengthCm", e.target.value)}
            />
          </div>
        </div>

        <div className="quote-actions">
          <button
            type="button"
            className="secondary"
            disabled={categoryLoading || !form.productName.trim()}
            onClick={detectCategory}
          >
            {categoryLoading ? "Detectando..." : "1. Detectar categoria"}
          </button>
          <button
            type="button"
            className="primary inline"
            disabled={
              priceLoading ||
              !form.categoryId ||
              !form.productName.trim() ||
              number(form.supplierPrice) <= 0 ||
              number(form.weightGrams) <= 0 ||
              number(form.heightCm) <= 0 ||
              number(form.widthCm) <= 0 ||
              number(form.lengthCm) <= 0
            }
            onClick={suggestPrice}
          >
            {priceLoading ? "Calculando preço..." : "2. Sugerir preço"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={quoteLoading || !form.categoryId || number(form.salePrice) <= 0}
            onClick={compareListingTypes}
          >
            3. Comparar Clássico × Premium
          </button>
          <button
            type="button"
            className="primary inline"
            disabled={quoteLoading || !form.categoryId || number(form.salePrice) <= 0}
            onClick={applyMlQuote}
          >
            {quoteLoading ? "Consultando..." : "Atualizar custos da API"}
          </button>
        </div>

        {quoteMessage && (
          <div className="quote-message">{quoteMessage}</div>
        )}

        {comparison.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>Comissão</th>
                  <th>Tarifa fixa</th>
                  <th>Frete</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comparison.map((item) => (
                  <tr key={item.listingType}>
                    <td>
                      <strong>
                        {item.listingType === "CLASSIC"
                          ? "Clássico"
                          : "Premium"}
                      </strong>
                    </td>
                    <td>{item.commissionPercent.toFixed(2)}%</td>
                    <td>{money.format(item.fixedFee)}</td>
                    <td>{money.format(item.shippingCost)}</td>
                    <td>{money.format(item.analysis.profit)}</td>
                    <td>{item.analysis.marginPercent.toFixed(1)}%</td>
                    <td>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => useComparedQuote(item)}
                      >
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {kitRows.length > 0 && (
      <section className="kit-panel" id="kits">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Simulador de kits</p>
            <h2>Quando o kit melhora a conta?</h2>
          </div>
          <p>
            Prévia com desconto progressivo no preço do kit e o mesmo frete
            atual. Recalcule o frete antes de publicar kits maiores.
          </p>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kit</th>
                <th>Preço simulado</th>
                <th>Custo produto</th>
                <th>Lucro</th>
                <th>Margem</th>
                <th>ROI</th>
                <th>Preço mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {kitRows.map((item) => (
                <tr key={item.kitQuantity}>
                  <td>
                    <strong>{item.kitQuantity} un.</strong>
                  </td>
                  <td>{money.format(item.salePrice)}</td>
                  <td>{money.format(item.purchaseCost)}</td>
                  <td>{money.format(item.profit)}</td>
                  <td>{item.marginPercent.toFixed(1)}%</td>
                  <td>{item.roiPercent.toFixed(1)}%</td>
                  <td>{money.format(item.minimumSuggestedPrice)}</td>
                  <td>
                    <span
                      className={
                        "mini-verdict " +
                        (item.verdict === "GOOD"
                          ? "good"
                          : item.verdict === "TIGHT"
                            ? "tight"
                            : "bad")
                      }
                    >
                      {verdictLabel(item.verdict)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </section>
  );
}
