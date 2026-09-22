"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  analyzeProfitability,
  type ListingType,
  type ProfitabilityResult,
} from "@/lib/profitability";

type FormState = {
  productName: string;
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

const initial: FormState = {
  productName: "Arame encapado 10m",
  supplierPrice: "4.40",
  discountPercent: "35",
  kitQuantity: "5",
  salePrice: "59.90",
  listingType: "CLASSIC",
  commissionPercent: "11.5",
  fixedFee: "0",
  shippingCost: "12.95",
  operatingCost: "1.50",
  targetMarginPercent: "20",
  targetRoiPercent: "30",
  categoryId: "",
  weightGrams: "300",
  heightCm: "5",
  widthCm: "15",
  lengthCm: "20",
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

  const tone = useMemo(() => {
    if (!analysis) return "neutral";
    return analysis.verdict === "GOOD"
      ? "good"
      : analysis.verdict === "TIGHT"
        ? "tight"
        : "bad";
  }, [analysis]);

  const currentPreview = useMemo(
    () => analyzeProfitability(toInput(form)),
    [form],
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
  }, [form]);

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
          Use manualmente os custos do simulador ou conecte o Mercado Livre
          para consultar tarifa e frete da sua própria conta.
        </p>
      </div>

      <div className="analyzer-grid">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="field wide">
            <label>Produto</label>
            <input
              value={form.productName}
              onChange={(e) => field("productName", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Preço Bibelô / fornecedor</label>
            <input
              type="number"
              step="0.01"
              value={form.supplierPrice}
              onChange={(e) => field("supplierPrice", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Desconto %</label>
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
              value={form.salePrice}
              onChange={(e) => field("salePrice", e.target.value)}
            />
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

          {error && <div className="error wide">{error}</div>}

          <button className="primary wide" disabled={loading}>
            {loading ? "Calculando..." : "Analisar rentabilidade"}
          </button>
        </form>

        <div className={"panel result-panel " + tone}>
          {!analysis ? (
            <div className="empty-result">
              <span className="radar">◎</span>
              <h3>Prévia pronta</h3>
              <p>
                Com os números atuais: margem{" "}
                {currentPreview.marginPercent.toFixed(1)}% e ROI{" "}
                {currentPreview.roiPercent.toFixed(1)}%.
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
            Informe categoria, peso e dimensões da embalagem. O Radar usa
            listing_prices e shipping_options/free.
          </p>
        </div>

        <div className="quote-fields">
          <div className="field category">
            <label>Categoria ML</label>
            <input
              placeholder="Ex.: MLB12345"
              value={form.categoryId}
              onChange={(e) => field("categoryId", e.target.value.trim())}
            />
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
            disabled={quoteLoading || !form.categoryId}
            onClick={compareListingTypes}
          >
            Comparar Clássico × Premium
          </button>
          <button
            type="button"
            className="primary inline"
            disabled={quoteLoading || !form.categoryId}
            onClick={applyMlQuote}
          >
            {quoteLoading ? "Consultando..." : "Aplicar custos da API"}
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
    </section>
  );
}
