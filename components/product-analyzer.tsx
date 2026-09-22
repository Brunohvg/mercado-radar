"use client";

import { FormEvent, useMemo, useState } from "react";

type Analysis = {
  productName: string;
  supplierPrice: number;
  discountPercent: number;
  kitQuantity: number;
  salePrice: number;
  listingType: "CLASSIC" | "PREMIUM";
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  operatingCost: number;
  targetMarginPercent: number;
  targetRoiPercent: number;
  unitCost: number;
  purchaseCost: number;
  commissionAmount: number;
  amountReceived: number;
  profit: number;
  marginPercent: number;
  roiPercent: number;
  receivedPercent: number;
  breakEvenPrice: number;
  minimumSuggestedPrice: number;
  verdict: "GOOD" | "TIGHT" | "BAD";
};

type FormState = {
  productName: string;
  supplierPrice: string;
  discountPercent: string;
  kitQuantity: string;
  salePrice: string;
  listingType: "CLASSIC" | "PREMIUM";
  commissionPercent: string;
  fixedFee: string;
  shippingCost: string;
  operatingCost: string;
  targetMarginPercent: string;
  targetRoiPercent: string;
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
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function verdictLabel(verdict: Analysis["verdict"]) {
  if (verdict === "GOOD") return "COMPENSA TESTAR";
  if (verdict === "TIGHT") return "MARGEM APERTADA";
  return "NÃO COMPENSA";
}

export function ProductAnalyzer() {
  const [form, setForm] = useState<FormState>(initial);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tone = useMemo(() => {
    if (!analysis) return "neutral";
    return analysis.verdict === "GOOD"
      ? "good"
      : analysis.verdict === "TIGHT"
        ? "tight"
        : "bad";
  }, [analysis]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          supplierPrice: Number(form.supplierPrice),
          discountPercent: Number(form.discountPercent),
          kitQuantity: Number(form.kitQuantity),
          salePrice: Number(form.salePrice),
          commissionPercent: Number(form.commissionPercent),
          fixedFee: Number(form.fixedFee),
          shippingCost: Number(form.shippingCost),
          operatingCost: Number(form.operatingCost),
          targetMarginPercent: Number(form.targetMarginPercent),
          targetRoiPercent: Number(form.targetRoiPercent),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao analisar produto");
      setAnalysis(payload.analysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao analisar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="analyzer" id="analisar">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Analisador de produto</p>
          <h2>Preço, frete, comissão e margem em uma conta só.</h2>
        </div>
        <p>
          Nesta primeira versão, informe os custos mostrados pelo simulador do ML.
          A próxima etapa preencherá tarifa e frete pela API.
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
            <label>Preço Bibelô</label>
            <input type="number" step="0.01" value={form.supplierPrice} onChange={(e) => field("supplierPrice", e.target.value)} />
          </div>
          <div className="field">
            <label>Desconto %</label>
            <input type="number" step="0.01" value={form.discountPercent} onChange={(e) => field("discountPercent", e.target.value)} />
          </div>
          <div className="field">
            <label>Quantidade no kit</label>
            <input type="number" min="1" value={form.kitQuantity} onChange={(e) => field("kitQuantity", e.target.value)} />
          </div>
          <div className="field">
            <label>Preço de venda</label>
            <input type="number" step="0.01" value={form.salePrice} onChange={(e) => field("salePrice", e.target.value)} />
          </div>

          <div className="field">
            <label>Tipo de anúncio</label>
            <select value={form.listingType} onChange={(e) => field("listingType", e.target.value as FormState["listingType"])}>
              <option value="CLASSIC">Clássico</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
          <div className="field">
            <label>Comissão ML %</label>
            <input type="number" step="0.01" value={form.commissionPercent} onChange={(e) => field("commissionPercent", e.target.value)} />
          </div>
          <div className="field">
            <label>Tarifa fixa</label>
            <input type="number" step="0.01" value={form.fixedFee} onChange={(e) => field("fixedFee", e.target.value)} />
          </div>
          <div className="field">
            <label>Seu custo de frete</label>
            <input type="number" step="0.01" value={form.shippingCost} onChange={(e) => field("shippingCost", e.target.value)} />
          </div>
          <div className="field">
            <label>Custo operacional</label>
            <input type="number" step="0.01" value={form.operatingCost} onChange={(e) => field("operatingCost", e.target.value)} />
          </div>
          <div className="field">
            <label>Meta de margem %</label>
            <input type="number" step="0.01" value={form.targetMarginPercent} onChange={(e) => field("targetMarginPercent", e.target.value)} />
          </div>
          <div className="field">
            <label>Meta de ROI %</label>
            <input type="number" step="0.01" value={form.targetRoiPercent} onChange={(e) => field("targetRoiPercent", e.target.value)} />
          </div>

          {error && <div className="error wide">{error}</div>}

          <button className="primary wide" disabled={loading}>
            {loading ? "Calculando..." : "Analisar rentabilidade"}
          </button>
        </form>

        <div className={`panel result-panel ${tone}`}>
          {!analysis ? (
            <div className="empty-result">
              <span className="radar">◎</span>
              <h3>Pronto para calcular</h3>
              <p>Preencha os dados e veja se o produto merece seu capital.</p>
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
                <div><span>Custo unitário</span><strong>{money.format(analysis.unitCost)}</strong></div>
                <div><span>Custo do kit</span><strong>{money.format(analysis.purchaseCost)}</strong></div>
                <div><span>Comissão ML</span><strong>{money.format(analysis.commissionAmount)}</strong></div>
                <div><span>Recebe do ML</span><strong>{money.format(analysis.amountReceived)}</strong></div>
                <div><span>Margem</span><strong>{analysis.marginPercent.toFixed(1)}%</strong></div>
                <div><span>ROI</span><strong>{analysis.roiPercent.toFixed(1)}%</strong></div>
              </div>

              <div className="recommendation">
                <span>Preço mínimo para suas metas</span>
                <strong>{money.format(analysis.minimumSuggestedPrice)}</strong>
                <small>
                  Ponto de equilíbrio: {money.format(analysis.breakEvenPrice)} · ML deixa {analysis.receivedPercent.toFixed(1)}% do preço antes do custo do produto.
                </small>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="roadmap" id="kits">
        <div>
          <strong>Agora</strong>
          <span>Análise manual confiável</span>
        </div>
        <div>
          <strong>Próximo</strong>
          <span>API Mercado Livre + kits automáticos</span>
        </div>
        <div>
          <strong>Depois</strong>
          <span>Vendas reais + estoque + oportunidades</span>
        </div>
      </section>
    </section>
  );
}
