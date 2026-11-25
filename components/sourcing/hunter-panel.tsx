"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { HunterCandidate } from "@/lib/hunter/rank";
import { api, brl } from "./format";

type HunterResult = {
  generatedAt: string;
  seeds: Array<{ id: string; name: string | null; revenue: number; keywords: string[]; source: string }>;
  candidates: HunterCandidate[];
  assumptions: string[];
};

// Caçador do próximo produto: o que revender nas categorias em que você já vende.
export function HunterPanel() {
  const router = useRouter();
  const [data, setData] = useState<HunterResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState("");

  async function load(refresh = false) {
    setLoading(true);
    setError("");
    try {
      const body = await api<HunterResult>("/api/hunter" + (refresh ? "?refresh=1" : ""));
      if (!Array.isArray(body.candidates)) throw new Error("Resposta inesperada.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível buscar produtos.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function study(c: HunterCandidate) {
    setCreating(c.productId);
    try {
      const body = await api<{ opportunity: { id: string } }>("/api/sourcing/opportunities", {
        method: "POST",
        body: JSON.stringify({
          title: c.name,
          permalink: c.permalink,
          categoryId: c.categoryId,
          referencePrice: c.price,
          referenceSource: c.price != null ? "MEDIANA_MERCADO" : null,
        }),
      });
      router.push(`/onde-comprar/${body.opportunity.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o estudo.");
      setCreating("");
    }
  }

  const viable = data?.candidates.filter((c) => c.viable) ?? [];
  return (
    <section className="vr-card vr-card--accent hunter" aria-labelledby="hunter-title">
      <div className="hunter-head">
        <div>
          <h2 id="hunter-title">Produtos para você revender</h2>
          <p className="vr-muted">
            Mais vendidos e buscas em alta nas categorias em que você já fatura, com quanto você pode pagar ao fornecedor para ter a sua margem.
          </p>
        </div>
        <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={loading} onClick={() => void load(true)}>
          {loading ? "Buscando..." : "Atualizar"}
        </button>
      </div>

      {loading && !data && <p className="vr-muted">Lendo mais vendidos, ofertas e tarifas do Mercado Livre… pode levar meio minuto.</p>}
      {error && <p className="vr-alert" role="alert">{error}</p>}

      {data && (
        <>
          {!!data.seeds.length && (
            <div className="hunter-seeds">
              {data.seeds.map((seed) => (
                <div key={seed.id}>
                  <strong>{seed.name ?? seed.id}</strong>
                  {!!seed.keywords.length && (
                    <span className="vr-tags">
                      {seed.keywords.slice(0, 6).map((k) => (
                        <a key={k} href={`/onde-comprar?q=${encodeURIComponent(k)}`}>{k}</a>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!data.candidates.length && (
            <p className="vr-muted">Não encontrei produtos de catálogo nas suas categorias agora. Sincronize seus anúncios e pedidos e tente de novo.</p>
          )}
          <ol className="hunter-list">
            {(viable.length ? viable : data.candidates).slice(0, 8).map((c) => (
              <li key={c.productId}>
                {c.picture ? <img src={c.picture} alt="" loading="lazy" /> : <span className="hunter-ph" aria-hidden="true" />}
                <div className="hunter-main">
                  <a href={c.permalink ?? "#"} target="_blank" rel="noreferrer" className="hunter-name">{c.name}</a>
                  <span className="hunter-meta">
                    {c.price != null ? `vende por ${brl(c.price)}` : "preço indisponível"} · {c.sellers} vendedor(es)
                    {c.fullShare != null ? ` · ${Math.round(c.fullShare * 100)}% Full` : ""}
                  </span>
                  {!!c.reasons.length && <span className="hunter-reasons">{c.reasons.join(" · ")}</span>}
                  {!!c.warnings.length && <span className="hunter-warn">{c.warnings.join(" · ")}</span>}
                  {c.formula && (
                    <details><summary>Ver a conta</summary><p>{c.formula}</p></details>
                  )}
                </div>
                <div className="hunter-side">
                  <span className="hunter-label">Pague até</span>
                  <strong className={c.viable ? "good" : "bad"}>
                    {c.maxCost == null ? "sem teto" : c.maxCost <= 0 ? "sem margem" : brl(c.maxCost)}
                  </strong>
                  {c.testLot && <span className="hunter-label">lote de {c.testLot.units} un.: {brl(c.testLot.capital)}</span>}
                  <button type="button" className="vr-btn vr-btn--small" disabled={creating === c.productId} onClick={() => void study(c)}>
                    {creating === c.productId ? "Criando..." : "Estudar fornecedores"}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!!data.assumptions.length && (
            <ul className="hunter-notes">{data.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
        </>
      )}
    </section>
  );
}
