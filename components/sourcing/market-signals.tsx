"use client";

import { useState } from "react";
import { api, brl, dateBr } from "./format";
import type { ListingInsights, Signal } from "@/lib/marketplaces/types";

type Props = {
  opportunityId: string;
  mlItemId: string | null;
  permalink: string | null;
  packQuantity: number | null;
  insights: ListingInsights | null;
  insightsAt: string | null;
  onChanged: (message: string) => Promise<unknown>;
  setError: (value: string) => void;
};

const pctRate = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const LEVEL_TEXT: Record<string, string> = { red: "vermelho", orange: "laranja", yellow: "amarelo", light_green: "verde-claro", green: "verde" };

function Missing({ signal }: { signal: Signal<unknown> }) {
  return <p className="vr-muted">{signal.reason ?? "Sem dados."}</p>;
}

/** Sinais públicos do anúncio de referência, lidos pela API oficial do marketplace. */
export function MarketSignals(props: Props) {
  const [busy, setBusy] = useState("");
  const { insights } = props;
  const canRead = Boolean(props.mlItemId && /^MLB\d/i.test(props.mlItemId));

  async function refresh() {
    setBusy("refresh");
    props.setError("");
    try {
      await api(`/api/sourcing/opportunities/${props.opportunityId}/insights`, { method: "POST" });
      await props.onChanged("Sinais do Mercado Livre atualizados.");
    } catch (caught) {
      props.setError(caught instanceof Error ? caught.message : "Falha ao ler o Mercado Livre.");
    } finally {
      setBusy("");
    }
  }

  async function useTier(index: number) {
    const price = insights?.price.data;
    const tier = price?.tiers[index];
    if (!tier) return;
    const seller = insights?.seller.data;
    const perListing = props.packQuantity && props.packQuantity > 0 ? props.packQuantity : 1;
    setBusy(`tier-${index}`);
    props.setError("");
    try {
      const created = await api<{ supplier: { id: string } }>("/api/sourcing/suppliers", {
        method: "POST",
        body: JSON.stringify({
          opportunityId: props.opportunityId,
          name: seller?.nickname ? `${seller.nickname} (Mercado Livre)` : "Vendedor do anúncio (Mercado Livre)",
          kind: "LOJA_ML",
          origin: "MERCADO_LIVRE",
          originUrl: props.permalink,
          city: seller?.city ?? null,
          state: seller?.state && seller.state.length === 2 ? seller.state : null,
          sellsToCpf: tier.businessOnly ? false : true,
          requiresCnpj: tier.businessOnly ? true : null,
          minOrderUnits: tier.minUnits * perListing,
          reputationNote: seller
            ? [seller.medal, seller.levelColor && `termômetro ${LEVEL_TEXT[seller.levelColor] ?? seller.levelColor}`, seller.completedSales != null && `${seller.completedSales} vendas no período`]
                .filter(Boolean)
                .join(" · ") || null
            : null,
        }),
      });
      await api("/api/sourcing/quotes", {
        method: "POST",
        body: JSON.stringify({
          opportunityId: props.opportunityId,
          supplierId: created.supplier.id,
          unitPrice: Math.round((tier.unitPrice / perListing) * 10000) / 10000,
          unitsPerPack: perListing,
          minUnits: tier.minUnits * perListing,
          exactMatch: true,
          source: "PRECO_PUBLICADO",
          evidenceUrl: props.permalink,
          notes: `Preço por quantidade publicado no anúncio ${props.mlItemId}: ${brl(tier.unitPrice)} por anúncio a partir de ${tier.minUnits}${tier.businessOnly ? " (só CNPJ)" : ""}. Frete da compra não incluso.`,
        }),
      });
      await props.onChanged("Faixa de preço salva como cotação publicada. Confira o frete na aba Margem.");
    } catch (caught) {
      props.setError(caught instanceof Error ? caught.message : "Falha ao salvar a cotação.");
    } finally {
      setBusy("");
    }
  }

  if (!canRead && !insights) return null;
  return (
    <section className="vr-card vr-signals" aria-label="Sinais do Mercado Livre">
      <div className="vr-signals-head">
        <div>
          <h2>Sinais do Mercado Livre</h2>
          <p className="vr-hint">
            {props.insightsAt
              ? `Lidos da API oficial em ${dateBr(props.insightsAt)}. Só leitura, nada é publicado.`
              : "Ainda não lidos. Precisa do Mercado Livre conectado."}
          </p>
        </div>
        {canRead && (
          <button className="vr-btn vr-btn--small" onClick={refresh} disabled={busy !== ""}>
            {busy === "refresh" ? "Lendo…" : props.insightsAt ? "Atualizar" : "Ler sinais"}
          </button>
        )}
      </div>

      {insights && (
        <div className="vr-signals-grid">
          <article>
            <h3>Preço por quantidade</h3>
            {insights.price.data ? (
              <>
                <p className="vr-muted">
                  Varejo {brl(insights.price.data.consumerPrice)}
                  {insights.price.data.promotion && insights.price.data.regularPrice ? ` (de ${brl(insights.price.data.regularPrice)})` : ""}
                  {insights.price.data.businessPrice != null ? ` · CNPJ ${brl(insights.price.data.businessPrice)}` : ""}
                </p>
                {insights.price.data.tiers.length ? (
                  <ul className="vr-signal-list">
                    {insights.price.data.tiers.map((tier, index) => (
                      <li key={`${tier.minUnits}-${tier.businessOnly}`}>
                        <span>
                          A partir de <strong>{tier.minUnits}</strong>: <strong className="vr-num">{brl(tier.unitPrice)}</strong> cada
                          {tier.businessOnly && <small> só CNPJ</small>}
                        </span>
                        <button className="vr-link" onClick={() => useTier(index)} disabled={busy !== ""}>
                          {busy === `tier-${index}` ? "Salvando…" : "Usar como cotação"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="vr-hint">Este anúncio não publica preço por quantidade.</p>
                )}
              </>
            ) : (
              <Missing signal={insights.price} />
            )}
          </article>

          <article>
            <h3>Vendedor</h3>
            {insights.seller.data ? (
              <dl className="vr-facts">
                <div><dt>Loja</dt><dd>{insights.seller.data.nickname ?? "—"}{insights.seller.data.officialStore && <small> loja oficial</small>}</dd></div>
                <div><dt>Local</dt><dd>{[insights.seller.data.city, insights.seller.data.state].filter(Boolean).join(" / ") || "—"}</dd></div>
                <div><dt>Reputação</dt><dd>{insights.seller.data.medal ?? (insights.seller.data.levelColor ? `termômetro ${LEVEL_TEXT[insights.seller.data.levelColor] ?? insights.seller.data.levelColor}` : "—")}</dd></div>
                <div><dt>Vendas no período</dt><dd>{insights.seller.data.completedSales ?? "—"}</dd></div>
                <div><dt>Reclamações</dt><dd>{pctRate(insights.seller.data.claimsRate)}</dd></div>
              </dl>
            ) : (
              <Missing signal={insights.seller} />
            )}
          </article>

          <article>
            <h3>O que os compradores perguntam</h3>
            {insights.questions.data ? (
              <>
                <p className="vr-muted">
                  {insights.questions.data.total ?? insights.questions.data.sampled} perguntas
                  {insights.questions.data.unansweredInSample > 0 && ` · ${insights.questions.data.unansweredInSample} sem resposta entre as recentes`}
                </p>
                {insights.questions.data.topics.length > 0 && (
                  <p className="vr-tags">
                    {insights.questions.data.topics.slice(0, 5).map((t) => <span key={t.topic}>{t.label} · {t.count}</span>)}
                  </p>
                )}
                <ul className="vr-quotes">
                  {insights.questions.data.recent.slice(0, 3).map((q, i) => <li key={i}>“{q.text}”</li>)}
                </ul>
                <p className="vr-hint">Use as dúvidas para perguntar ao fornecedor e para escrever o seu anúncio.</p>
              </>
            ) : (
              <Missing signal={insights.questions} />
            )}
          </article>

          <article>
            <h3>Opiniões</h3>
            {insights.reviews.data ? (
              <>
                <p className="vr-muted">
                  Nota <strong className="vr-num">{insights.reviews.data.average?.toLocaleString("pt-BR") ?? "—"}</strong> em {insights.reviews.data.total} opiniões
                </p>
                {insights.reviews.data.recentCritical.length > 0 ? (
                  <ul className="vr-quotes">
                    {insights.reviews.data.recentCritical.map((r, i) => <li key={i}>{r.rate}★ “{r.text}”</li>)}
                  </ul>
                ) : (
                  <p className="vr-hint">Nenhuma crítica entre as opiniões recentes.</p>
                )}
              </>
            ) : (
              <Missing signal={insights.reviews} />
            )}
          </article>

          <article className="vr-signals-wide">
            <h3>Ficha exigida pela categoria</h3>
            {insights.category.data ? (
              <>
                <p className="vr-muted">{insights.category.data.path.join(" › ") || insights.category.data.name}</p>
                {insights.category.data.requiredAttributes.length ? (
                  <p className="vr-tags">
                    {insights.category.data.requiredAttributes.map((a) => (
                      <span key={a.id} className={insights.category.data!.missingInReference.some((m) => m.id === a.id) ? "is-missing" : ""}>{a.name}</span>
                    ))}
                  </p>
                ) : (
                  <p className="vr-hint">A categoria não marca atributos obrigatórios.</p>
                )}
                <p className="vr-hint">Peça esses dados ao fornecedor antes de comprar: sem eles o anúncio não sobe.{insights.category.data.missingInReference.length > 0 && " Em destaque, os que nem o anúncio de referência informa."}</p>
              </>
            ) : (
              <Missing signal={insights.category} />
            )}
          </article>
        </div>
      )}
    </section>
  );
}
