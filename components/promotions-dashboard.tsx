"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvaluatedInvite } from "@/lib/promotions/evaluate";

type Payload = {
  generatedAt: string;
  promotions: number;
  invites: EvaluatedInvite[];
  notes: string[];
  targetMarginPercent: number;
  error?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : null);

const VERDICT: Record<EvaluatedInvite["verdict"], { label: string; tone: string }> = {
  ACEITAR: { label: "Vale aceitar", tone: "good" },
  APERTADO: { label: "Margem abaixo da meta", tone: "warn" },
  RECUSAR: { label: "Dá prejuízo", tone: "risk" },
  SEM_DADOS: { label: "Faltam dados", tone: "muted" },
};

export function PromotionsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/promotions", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok || !Array.isArray(body.invites)) throw new Error(body.error || "Não foi possível ler as promoções.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = (data?.invites ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.verdict] = (acc[i.verdict] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="promotions-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Vender</p>
          <h1>Promoções do Mercado Livre</h1>
          <p>
            Cada convite de campanha com o lucro que sobra no preço da promoção. Aceite só o que fica acima da
            sua meta de {data?.targetMarginPercent ?? 20}%.
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? "Lendo..." : "Atualizar"}
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && !data && <div className="clean-loading">Lendo seus convites de promoção no Mercado Livre...</div>}

      {data && (
        <>
          <section className="clean-kpi-grid promo-kpis">
            <article className="clean-kpi-card accent"><span>Vale aceitar</span><strong>{counts.ACEITAR ?? 0}</strong><small>margem na meta</small></article>
            <article className="clean-kpi-card"><span>Abaixo da meta</span><strong>{counts.APERTADO ?? 0}</strong><small>lucro, mas pouco</small></article>
            <article className="clean-kpi-card"><span>Dão prejuízo</span><strong>{counts.RECUSAR ?? 0}</strong><small>não aceite</small></article>
            <article className="clean-kpi-card"><span>Faltam dados</span><strong>{counts.SEM_DADOS ?? 0}</strong><small>custo ou tarifa</small></article>
          </section>

          {!data.invites.length ? (
            <div className="clean-panel module-empty">
              <strong>Nenhum convite aberto agora</strong>
              <span>
                {data.promotions
                  ? `Há ${data.promotions} campanha(s) na sua conta, mas nenhum anúncio seu está como candidato.`
                  : "O Mercado Livre não tem campanha aberta para a sua conta neste momento."}
              </span>
            </div>
          ) : (
            <ul className="promo-list">
              {data.invites.map((invite) => {
                const key = `${invite.promotionId}:${invite.mlItemId}`;
                const v = VERDICT[invite.verdict];
                return (
                  <li key={key} className={`clean-panel promo-card promo-card--${v.tone}`}>
                    <div className="promo-main">
                      <div className="promo-tags">
                        <span className={`promo-verdict tone-${v.tone}`}>{v.label}</span>
                        <span className="promo-type">{invite.typeLabel}</span>
                        {invite.promotionName && <span className="promo-name">{invite.promotionName}</span>}
                      </div>
                      <strong className="promo-title" title={invite.title}>{invite.title}</strong>
                      <p className="promo-prices">
                        {money.format(invite.currentPrice)} → <b>{money.format(invite.dealPrice)}</b>
                        {invite.discountPercent != null && ` (−${pct(invite.discountPercent)})`}
                        {invite.meliPercent ? ` · o ML paga ${pct(invite.meliPercent)} do desconto` : ""}
                        {date(invite.deadline) ? ` · aceitar até ${date(invite.deadline)}` : date(invite.finishDate) ? ` · vai até ${date(invite.finishDate)}` : ""}
                      </p>
                      {invite.formula ? (
                        <details className="pilot-formula">
                          <summary>Ver a conta</summary>
                          <p>{invite.formula}</p>
                        </details>
                      ) : (
                        <p className="promo-missing">Falta {invite.missing.join(", ")} para calcular o lucro.</p>
                      )}
                    </div>
                    <div className="promo-side">
                      <span className="promo-profit-label">Lucro por venda</span>
                      <strong className={invite.profit == null ? "is-pending" : invite.profit < 0 ? "danger-value" : "good-value"}>
                        {invite.profit == null ? "—" : money.format(invite.profit)}
                      </strong>
                      <small>{invite.marginPercent == null ? "" : `margem ${pct(invite.marginPercent)}`}</small>
                      {joined[key] ? (
                        <p className="pilot-done" role="status">{joined[key]}</p>
                      ) : invite.joinable && (invite.verdict === "ACEITAR" || invite.verdict === "APERTADO") ? (
                        <JoinButton invite={invite} onDone={(msg) => setJoined((j) => ({ ...j, [key]: msg }))} />
                      ) : (
                        <a className="vr-btn vr-btn--ghost vr-btn--small" href="https://www.mercadolivre.com.br/anuncios/lista/promos" target="_blank" rel="noreferrer">
                          Ver no Mercado Livre
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!!data.notes.length && (
            <ul className="pilot-notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          <p className="pilot-foot">
            Tarifa e frete vêm dos seus pedidos dos últimos 30 dias. Quando o ML banca parte do desconto, contamos só a sua parte.
            Nada entra em promoção sem o seu clique em confirmar, e tudo fica registrado.
          </p>
        </>
      )}
    </section>
  );
}

function JoinButton({ invite, onDone }: { invite: EvaluatedInvite; onDone: (message: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tight = invite.verdict === "APERTADO";

  async function join() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/promotions/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mlItemId: invite.mlItemId, promotionId: invite.promotionId, promotionType: invite.promotionType, allowTight: tight, confirm: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível aceitar.");
      onDone(`Anúncio entrou na promoção a ${money.format(invite.dealPrice)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível aceitar.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming)
    return (
      <>
        <button type="button" className={`vr-btn vr-btn--small${tight ? " vr-btn--ghost" : ""}`} onClick={() => setConfirming(true)}>
          {tight ? "Aceitar mesmo assim" : "Aceitar promoção"}
        </button>
        {error && <p className="pilot-exec-error" role="alert">{error}</p>}
      </>
    );
  return (
    <div className="promo-confirm">
      <span>Entrar a {money.format(invite.dealPrice)} no Mercado Livre?</span>
      <button type="button" className="vr-btn vr-btn--small" disabled={busy} onClick={() => void join()}>
        {busy ? "Enviando..." : "Sim, aceitar"}
      </button>
      <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={busy} onClick={() => setConfirming(false)}>Voltar</button>
    </div>
  );
}
