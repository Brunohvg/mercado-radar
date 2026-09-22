"use client";

import { useCallback, useEffect, useState } from "react";

type Opportunity = {
  keyword: string;
  position: number;
  categoryId: string;
  categoryName: string;
  marketMedian: number;
  targetPurchasePrice: number | null;
  dimensions?: {
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
  };
  dimensionsConfidence: string;
  comparableCount: number;
  bestSellerPosition: number | null;
  bestSellerEvidence: "DIRECT_ITEM_MATCH" | "CATEGORY_ONLY";
  feeAmount?: number;
  shippingCost?: number;
  status: string;
};

type Payload = {
  source: string;
  generatedAt: string;
  opportunities: Opportunity[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function OpportunityRadar() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ml/opportunities", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar oportunidades.");
      }

      setData(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao carregar oportunidades.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="module-section opportunity-module" id="oportunidades">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sourcing Intelligence</p>
          <h2>O que merece ser investigado antes de comprar?</h2>
        </div>
        <div className="module-heading-actions">
          <p>
            O Radar cruza sinais de mercado com os custos da sua conta para
            transformar “produto interessante” em “até quanto eu poderia pagar”.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "Analisando mercado..." : "Atualizar radar"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="module-loading">
          Lendo tendências e calculando oportunidades...
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {data && data.opportunities.length === 0 && (
        <div className="module-empty">
          Não encontrei oportunidades com evidência suficiente nesta leitura.
        </div>
      )}

      {data && data.opportunities.length > 0 && (
        <>
          <div className="opportunity-explainer">
            <strong>Como ler:</strong>
            <span>
              “Comprar até” é um teto preliminar para tentar manter 20% de
              margem e 30% de ROI no preço mediano. Antes de comprar, abra a
              análise completa do produto.
            </span>
          </div>

          <div className="opportunity-grid">
            {data.opportunities.map((item) => (
              <article
                className={
                  "opportunity-card " +
                  (item.targetPurchasePrice != null &&
                  item.targetPurchasePrice > 0
                    ? "candidate"
                    : "needs-data")
                }
                key={item.keyword}
              >
                <div className="opportunity-rank">
                  <span>#{item.position}</span>
                  <small>crescimento semanal</small>
                </div>

                <h3>{item.keyword}</h3>
                <p>{item.categoryName}</p>

                <div className="opportunity-numbers">
                  <div>
                    <span>Mediana de venda</span>
                    <strong>{money.format(item.marketMedian)}</strong>
                  </div>
                  <div>
                    <span>Comprar até</span>
                    <strong>
                      {item.targetPurchasePrice == null
                        ? "Precisa validar"
                        : money.format(item.targetPurchasePrice)}
                    </strong>
                  </div>
                </div>

                <div className="opportunity-foot">
                  <span>{item.comparableCount} comparáveis</span>
                  <span>
                    {item.bestSellerPosition != null
                      ? `#${item.bestSellerPosition} entre mais vendidos`
                      : "ranking da categoria consultado"}
                  </span>
                </div>

                <a
                  href={`/analisar?q=${encodeURIComponent(item.keyword)}`}
                >
                  Analisar este produto
                </a>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
