"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Range = { value: number | null; low: number | null; high: number | null };

type Estimate = {
  method: "OFICIAL" | "HISTORICO" | "VIDA" | "PAGINA";
  confidence: 0 | 1 | 2 | 3;
  salesPerDay: Range;
  revenuePerDay: Range;
  visitsPerDay: Range;
  conversion: { value: number; source: string };
  sold: { lower: number | null; upper: number | null; exact: boolean };
  ageDays: { value: number | null; source: string | null };
  windowDays: number | null;
  observations: number;
  basis: string[];
};

type Insight = {
  id: string;
  title: string;
  permalink: string | null;
  thumbnail: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  soldLabel: string | null;
  freeShipping: boolean;
  fulfillment: boolean;
  bestSellerLabel: string | null;
  isOwn: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  estimate: Estimate;
  score: number;
  demand: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE" | null;
};

type ListPayload = {
  items: Insight[];
  summary: { marketItems: number; ownItems: number; snapshots: number; withHistory: number };
  calibration: {
    conversion: { value: number; low: number; high: number; source: "SUA_CONTA" | "PADRAO"; sample: number };
    soldPerReview: { value: number; sample: number };
    ageAnchors: number;
    ageModel: boolean;
  };
};

type SeriesPoint = {
  at: string;
  source: string;
  price: number | null;
  soldLower: number | null;
  soldExact: number | null;
  reviews: number | null;
  visitsTotal: number | null;
};

type Detail = { insight: Insight; series: SeriesPoint[] };

const METHOD: Record<Estimate["method"], { label: string; tone: string; hint: string }> = {
  OFICIAL: { label: "Oficial", tone: "official", hint: "Pedidos e visitas reais da sua conta." },
  HISTORICO: { label: "Histórico", tone: "history", hint: "Medido pela diferença entre leituras do Radar." },
  VIDA: { label: "Estimativa", tone: "estimate", hint: "Vendidos acumulados ÷ idade do anúncio." },
  PAGINA: { label: "Página", tone: "page", hint: "Só o acumulado que a página mostra; ainda sem ritmo." },
};

const CONFIDENCE = ["Sem medição", "Confiança baixa", "Confiança média", "Confiança alta"];

const SORTS = {
  revenue: "Maior faturamento/dia",
  sales: "Mais vendas/dia",
  visits: "Mais visitas/dia",
  score: "Melhor score",
  recent: "Visto mais recentemente",
} as const;

type SortKey = keyof typeof SORTS;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function n(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("pt-BR");
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1e6) return "R$ " + (value / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (value >= 1e5) return "R$ " + Math.round(value / 1e3).toLocaleString("pt-BR") + " mil";
  if (value >= 100) return "R$ " + Math.round(value).toLocaleString("pt-BR");
  return brl.format(value).replace(/,00$/, "");
}

function span(range: Range, format: (v: number) => string) {
  if (range.low == null || range.high == null) return null;
  if (Math.abs(range.high - range.low) < 1e-9) return null;
  return `${format(range.low)} a ${format(range.high)}`.replace(/^R\$ (.+) a R\$ /, "R$ $1 a ");
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return minutes <= 1 ? "agora" : `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

function Signal({ level }: { level: number }) {
  return (
    <span className="signal" data-level={level} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function SourceBadge({ estimate }: { estimate: Estimate }) {
  const meta = METHOD[estimate.method];
  return (
    <span
      className={`source-badge source-badge--${meta.tone}`}
      title={`${meta.hint} ${CONFIDENCE[estimate.confidence]}.`}
    >
      <Signal level={estimate.confidence} />
      {meta.label}
      <span className="sr-only">, {CONFIDENCE[estimate.confidence].toLowerCase()}</span>
    </span>
  );
}

/* Gráfico de uma série (sem eixo duplo): linha fina + pontos com tooltip nativo. */
function SeriesChart({
  title,
  points,
  format,
  emptyText,
}: {
  title: string;
  points: Array<{ at: string; value: number }>;
  format: (v: number) => string;
  emptyText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <figure className="market-chart market-chart--empty">
        <figcaption>{title}</figcaption>
        <p>{emptyText}</p>
      </figure>
    );
  }

  const W = 320;
  const H = 120;
  const pad = { l: 4, r: 4, t: 10, b: 18 };
  const times = points.map((p) => new Date(p.at).getTime());
  const values = points.map((p) => p.value);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  let v0 = Math.min(...values);
  let v1 = Math.max(...values);
  if (v0 === v1) {
    v0 -= 1;
    v1 += 1;
  }
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - v0) / (v1 - v0)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const active = Math.min(hover ?? points.length - 1, points.length - 1);
  const date = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <figure className="market-chart">
      <figcaption>
        <span>{title}</span>
        <strong className="num">{format(points[active].value)}</strong>
        <small>{new Date(points[active].at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}: de ${format(values[0])} para ${format(values[values.length - 1])}`}
        onMouseLeave={() => setHover(null)}
      >
        <line className="market-chart__base" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        <path className="market-chart__line" d={path} />
        {points.map((p, i) => (
          <g key={p.at + i}>
            <rect
              className="market-chart__hit"
              x={x(times[i]) - 10}
              y={0}
              width={20}
              height={H}
              onMouseEnter={() => setHover(i)}
            />
            <circle
              className={"market-chart__dot" + (i === active ? " is-active" : "")}
              cx={x(times[i])}
              cy={y(p.value)}
              r={i === active ? 4.5 : 2.5}
            />
          </g>
        ))}
        <text className="market-chart__tick" x={pad.l} y={H - 4}>{date(t0)}</text>
        <text className="market-chart__tick" x={W - pad.r} y={H - 4} textAnchor="end">{date(t1)}</text>
      </svg>
    </figure>
  );
}

export function MarketIntelligence() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"market" | "own" | "all">("market");
  const [sort, setSort] = useState<SortKey>("revenue");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/market/items?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar o mercado.");
      if (seq === loadSeq.current) setData(body);
    } catch (caught) {
      if (seq !== loadSeq.current) return;
      setError(caught instanceof Error ? caught.message : "Falha ao carregar o mercado.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [scope, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError("");
    fetch(`/api/market/items/${selected}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Falha ao carregar o histórico.");
        if (active) setDetail(body);
      })
      .catch((caught) => {
        if (active) setDetailError(caught instanceof Error ? caught.message : "Falha ao carregar o histórico.");
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const rows = useMemo(() => {
    const items = [...(data?.items ?? [])];
    const key = (item: Insight) => {
      switch (sort) {
        case "sales":
          return item.estimate.salesPerDay.value ?? -1;
        case "visits":
          return item.estimate.visitsPerDay.value ?? -1;
        case "score":
          return item.score;
        case "recent":
          return new Date(item.lastSeenAt).getTime();
        default:
          return item.estimate.revenuePerDay.value ?? -1;
      }
    };
    return items.sort((a, b) => key(b) - key(a));
  }, [data, sort]);

  const conversion = data?.calibration.conversion;
  const totalRevenue = rows.reduce((sum, r) => sum + (r.estimate.revenuePerDay.value ?? 0), 0);

  return (
    <section className="market-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>Mercado</h1>
          <p>
            Vendas, faturamento e visitas por dia dos anúncios que você abriu no Mercado Livre,
            de qualquer vendedor. Cada nova visita a um anúncio deixa a medição mais precisa.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="secondary" href="/extensao">
            Instalar extensão
          </Link>
        </div>
      </header>

      {data && (
        <section className="clean-kpi-grid market-kpis" aria-label="Resumo da medição">
          <article className="clean-kpi-card">
            <span>Anúncios observados</span>
            <strong>{n(data.summary.marketItems, 0)}</strong>
            <small>de outros vendedores</small>
          </article>
          <article className="clean-kpi-card">
            <span>Medidos por histórico</span>
            <strong>{n(data.summary.withHistory, 0)}</strong>
            <small>com duas ou mais leituras no tempo</small>
          </article>
          <article className="clean-kpi-card">
            <span>Leituras gravadas</span>
            <strong>{n(data.summary.snapshots, 0)}</strong>
            <small>{n(data.summary.ownItems, 0)} anúncios seus calibram o modelo</small>
          </article>
          <article className="clean-kpi-card accent">
            <span>Faturamento/dia na lista</span>
            <strong>{money(totalRevenue)}</strong>
            <small>
              conversão {conversion ? n(conversion.value * 100) + "%" : "—"}{" "}
              {conversion?.source === "SUA_CONTA" ? "da sua conta" : "padrão de mercado"}
            </small>
          </article>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      <div className={"market-layout" + (selected ? " has-detail" : "")}>
        <section className="clean-panel table-panel market-list">
          <div className="table-toolbar">
            <div className="market-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título ou MLB"
                aria-label="Buscar anúncio observado"
              />
            </div>
            <div className="market-filters">
              <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} aria-label="Quais anúncios">
                <option value="market">Concorrentes</option>
                <option value="own">Meus anúncios</option>
                <option value="all">Todos</option>
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Ordenar">
                {Object.entries(SORTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && !data ? (
            <div className="clean-loading market-inset">Carregando anúncios observados…</div>
          ) : rows.length === 0 ? (
            <div className="module-empty market-inset">
              <strong>{query ? "Nenhum anúncio com esse termo" : "Nenhum anúncio observado ainda"}</strong>
              <p>
                {query
                  ? "Tente outro termo ou troque o filtro de anúncios."
                  : "Com a extensão instalada, navegue por buscas e anúncios no Mercado Livre. Cada página que você abrir aparece aqui com vendas, faturamento e visitas por dia."}
              </p>
              {!query && (
                <Link className="primary" href="/extensao">
                  Instalar a extensão
                </Link>
              )}
            </div>
          ) : (
            <div className="clean-table-wrap">
              <table className="clean-table market-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th className="is-num">Preço</th>
                    <th className="is-num">Vendas/dia</th>
                    <th className="is-num">Faturamento/dia</th>
                    <th className="is-num">Visitas/dia</th>
                    <th>Medição</th>
                    <th className="is-num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const e = item.estimate;
                    const isSelected = selected === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? "is-selected" : undefined}
                        onClick={() => setSelected(isSelected ? null : item.id)}
                      >
                        <td>
                          <div className="clean-product-cell">
                            {item.thumbnail ? (
                              <img src={item.thumbnail} alt="" loading="lazy" />
                            ) : (
                              <span className="clean-product-thumb">MR</span>
                            )}
                            <div>
                              <button
                                type="button"
                                className="market-row-title"
                                aria-expanded={isSelected}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelected(isSelected ? null : item.id);
                                }}
                              >
                                {item.title}
                              </button>
                              <small>
                                {item.id}
                                {item.isOwn ? " · seu anúncio" : ""}
                                {item.fulfillment ? " · Full" : item.freeShipping ? " · frete grátis" : ""}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="is-num" data-label="Preço">{item.price == null ? "—" : brl.format(item.price)}</td>
                        <td className="is-num" data-label="Vendas/dia">
                          <span className="market-value">{n(e.salesPerDay.value)}</span>
                          {span(e.salesPerDay, (v) => n(v)) && (
                            <span className="table-subtext">{span(e.salesPerDay, (v) => n(v))}</span>
                          )}
                        </td>
                        <td className="is-num" data-label="Faturamento/dia">
                          <span className="market-value market-value--strong">{money(e.revenuePerDay.value)}</span>
                          {span(e.revenuePerDay, money) && <span className="table-subtext">{span(e.revenuePerDay, money)}</span>}
                        </td>
                        <td className="is-num" data-label="Visitas/dia">
                          <span className="market-value">{n(e.visitsPerDay.value, 0)}</span>
                          {span(e.visitsPerDay, (v) => n(v, 0)) && (
                            <span className="table-subtext">{span(e.visitsPerDay, (v) => n(v, 0))}</span>
                          )}
                        </td>
                        <td data-label="Medição">
                          <SourceBadge estimate={e} />
                          <span className="table-subtext">visto {relative(item.lastSeenAt)}</span>
                        </td>
                        <td className="is-num" data-label="Score">
                          <span className={"market-score " + (item.score >= 65 ? "is-high" : item.score >= 45 ? "is-mid" : "is-low")}>
                            {item.score}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <aside className="clean-panel market-detail" aria-label="Detalhes do anúncio">
            <div className="market-detail__head">
              <div>
                <span>{selected}</span>
                <strong>{detail?.insight.title ?? "Carregando…"}</strong>
              </div>
              <button type="button" className="icon-button" aria-label="Fechar detalhes" onClick={() => setSelected(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {detailError && <div className="error">{detailError}</div>}
            {!detail && !detailError && <div className="clean-loading">Carregando histórico…</div>}

            {detail && (
              <>
                <div className="market-detail__meta">
                  <SourceBadge estimate={detail.insight.estimate} />
                  <span>{CONFIDENCE[detail.insight.estimate.confidence]}</span>
                  {detail.insight.permalink && (
                    <a href={detail.insight.permalink} target="_blank" rel="noreferrer" className="inline-link-button">
                      Abrir no Mercado Livre
                    </a>
                  )}
                </div>

                <div className="market-readouts">
                  <div>
                    <span>Vendas/dia</span>
                    <strong className="num">{n(detail.insight.estimate.salesPerDay.value)}</strong>
                    <small>{span(detail.insight.estimate.salesPerDay, (v) => n(v)) ?? " "}</small>
                  </div>
                  <div>
                    <span>Faturamento/dia</span>
                    <strong className="num">{money(detail.insight.estimate.revenuePerDay.value)}</strong>
                    <small>{span(detail.insight.estimate.revenuePerDay, money) ?? " "}</small>
                  </div>
                  <div>
                    <span>Visitas/dia</span>
                    <strong className="num">{n(detail.insight.estimate.visitsPerDay.value, 0)}</strong>
                    <small>{span(detail.insight.estimate.visitsPerDay, (v) => n(v, 0)) ?? " "}</small>
                  </div>
                </div>

                <dl className="market-facts">
                  <div>
                    <dt>Vendidos (total)</dt>
                    <dd>
                      {detail.insight.estimate.sold.lower == null
                        ? "—"
                        : detail.insight.estimate.sold.exact
                          ? n(detail.insight.estimate.sold.lower, 0)
                          : `${n(detail.insight.estimate.sold.lower, 0)} a ${n(detail.insight.estimate.sold.upper, 0)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Avaliações</dt>
                    <dd>
                      {n(detail.insight.reviews, 0)}
                      {detail.insight.rating != null ? ` · nota ${n(detail.insight.rating)}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Idade do anúncio</dt>
                    <dd>
                      {detail.insight.estimate.ageDays.value == null
                        ? "—"
                        : `${n(detail.insight.estimate.ageDays.value, 0)} dias${detail.insight.estimate.ageDays.source === "ID_ESTIMADO" ? " (estimada)" : ""}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Conversão usada</dt>
                    <dd>{n(detail.insight.estimate.conversion.value * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Primeira leitura</dt>
                    <dd>{new Date(detail.insight.firstSeenAt).toLocaleDateString("pt-BR")}</dd>
                  </div>
                  <div>
                    <dt>Leituras</dt>
                    <dd>{n(detail.series.length, 0)}</dd>
                  </div>
                </dl>

                <div className="market-charts">
                  <SeriesChart
                    title="Avaliações acumuladas"
                    points={detail.series
                      .filter((p) => p.reviews != null)
                      .map((p) => ({ at: p.at, value: p.reviews as number }))}
                    format={(v) => n(v, 0)}
                    emptyText="Aparece a partir da segunda leitura com avaliações."
                  />
                  <SeriesChart
                    title="Preço"
                    points={detail.series
                      .filter((p) => p.price != null)
                      .map((p) => ({ at: p.at, value: p.price as number }))}
                    format={(v) => brl.format(v)}
                    emptyText="Aparece a partir da segunda leitura."
                  />
                </div>

                <section className="market-basis">
                  <strong>Como o Radar calculou</strong>
                  <ul>
                    {detail.insight.estimate.basis.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </aside>
        )}
      </div>

      {data && (
        <p className="market-footnote">
          Os números de outros vendedores são estimativas: a API do Mercado Livre só libera vendas e visitas
          exatas dos seus próprios anúncios. O Radar mede o ritmo pela diferença entre leituras da página
          (avaliações e faixa de vendidos) e mostra sempre o intervalo provável.
          {conversion?.source !== "SUA_CONTA" &&
            " Sincronize seus anúncios em Integrações para calibrar a conversão com os seus números."}
        </p>
      )}
    </section>
  );
}
