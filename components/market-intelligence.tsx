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
  catalogProductId?: string | null;
  sellerName?: string | null;
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

const CONFIDENCE = ["Só acumulado", "Confiança baixa", "Confiança média", "Confiança alta"];

type Tier = "MEDIDO" | "ESTIMADO" | "ACUMULADO";

const TIER: Record<Tier, { label: string; hint: string }> = {
  MEDIDO: { label: "Medido", hint: "Ritmo medido pela diferença entre leituras do Radar, ou pedidos reais da sua conta." },
  ESTIMADO: { label: "Estimado", hint: "Vendidos acumulados divididos pela idade do anúncio: uma média desde a criação." },
  ACUMULADO: { label: "Acumulado", hint: "Só o total de vendidos que a página mostra. O ritmo por dia ainda não pôde ser medido." },
};

const SORTS = {
  revenue: "Maior faturamento",
  sales: "Mais vendas por dia",
  score: "Melhor score",
  recent: "Visto recentemente",
  priceAsc: "Menor preço",
  priceDesc: "Maior preço",
} as const;

type SortKey = keyof typeof SORTS;
type Scope = "all" | "own" | "market";
type Switches = { measured: boolean; catalog: boolean; full: boolean; freeShipping: boolean };

function tierOf(item: Insight): Tier {
  const m = item.estimate.method;
  if (m === "OFICIAL" || m === "HISTORICO") return "MEDIDO";
  if (m === "VIDA") return "ESTIMADO";
  return "ACUMULADO";
}

/* faturamento acumulado = piso de vendidos × preço (não é por dia) */
function accumulated(item: Insight) {
  const sold = item.estimate.sold.lower;
  if (sold == null || item.price == null || sold <= 0) return null;
  return sold * item.price;
}

const DEMAND_TEXT: Record<NonNullable<Insight["demand"]>, string> = {
  EXCELENTE: "Excelente",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

const SWITCHES: Array<{ key: keyof Switches; label: string; test: (i: Insight) => boolean }> = [
  { key: "measured", label: "Com ritmo medido", test: (i) => tierOf(i) === "MEDIDO" },
  { key: "catalog", label: "Catálogo", test: (i) => Boolean(i.catalogProductId) },
  { key: "full", label: "Full", test: (i) => i.fulfillment },
  { key: "freeShipping", label: "Frete grátis", test: (i) => i.freeShipping },
];

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

function passes(item: Insight, scope: Scope, sw: Switches) {
  if (scope === "own" && !item.isOwn) return false;
  if (scope === "market" && item.isOwn) return false;
  for (const def of SWITCHES) {
    if (sw[def.key] && !def.test(item)) return false;
  }
  return true;
}

function sortRows(items: Insight[], sort: SortKey) {
  const copy = [...items];
  const rate = (i: Insight) => (tierOf(i) === "ACUMULADO" ? 0 : 1);
  switch (sort) {
    case "sales":
      return copy.sort(
        (a, b) =>
          rate(b) - rate(a) ||
          (b.estimate.salesPerDay.value ?? -1) - (a.estimate.salesPerDay.value ?? -1) ||
          b.score - a.score,
      );
    case "score":
      return copy.sort((a, b) => b.score - a.score);
    case "recent":
      return copy.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
    case "priceAsc":
      return copy.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case "priceDesc":
      return copy.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    default:
      // faturamento por dia primeiro; quem só tem acumulado vem depois, pelo acumulado
      return copy.sort(
        (a, b) =>
          rate(b) - rate(a) ||
          (rate(a)
            ? (b.estimate.revenuePerDay.value ?? -1) - (a.estimate.revenuePerDay.value ?? -1)
            : (accumulated(b) ?? -1) - (accumulated(a) ?? -1)),
      );
  }
}

function ConfidenceCell({ item }: { item: Insight }) {
  const level = item.estimate.confidence;
  const tier = tierOf(item);
  return (
    <span className="market-conf" title={`${TIER[tier].hint} ${CONFIDENCE[level]}.`}>
      <Signal level={level} />
      <span>
        {tier === "ACUMULADO" ? "Só acumulado" : CONFIDENCE[level].replace("Confiança ", "")}
        {tier !== "ACUMULADO" && <small>{TIER[tier].label.toLowerCase()}</small>}
      </span>
    </span>
  );
}

export function MarketIntelligence() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // O menu da extensão abre /mercado?q=termo.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial?.trim()) setQuery(initial.trim().slice(0, 120));
  }, []);
  const [scope, setScope] = useState<Scope>("all");
  const [sw, setSw] = useState<Switches>({ measured: false, catalog: false, full: false, freeShipping: false });
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
      const params = new URLSearchParams({ scope: "all", limit: "200" });
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
  }, [query]);

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

  const all = useMemo(() => data?.items ?? [], [data]);
  const rows = useMemo(() => sortRows(all.filter((i) => passes(i, scope, sw)), sort), [all, scope, sw, sort]);

  const scopeCount = (value: Scope) => all.filter((i) => passes(i, value, sw)).length;
  const switchCount = (key: keyof Switches) =>
    all.filter((i) => passes(i, scope, { ...sw, [key]: true })).length;
  const activeSwitches = Object.values(sw).filter(Boolean).length;

  const measured = all.filter((i) => tierOf(i) === "MEDIDO").length;
  const estimated = all.filter((i) => tierOf(i) === "ESTIMADO").length;
  const noRhythm = all.filter((i) => tierOf(i) === "ACUMULADO").length;
  const total = data ? data.summary.marketItems + data.summary.ownItems : 0;

  // colunas sem nenhum dado nas linhas visíveis somem
  const cols = {
    sales: rows.some((i) => i.estimate.salesPerDay.value != null),
    revenue: rows.some((i) => i.estimate.revenuePerDay.value != null || accumulated(i) != null),
    demand: rows.some((i) => i.demand != null),
  };

  const conversion = data?.calibration.conversion;

  function resetFilters() {
    setSw({ measured: false, catalog: false, full: false, freeShipping: false });
    setScope("all");
    setQuery("");
  }

  return (
    <section className="market-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Inteligência</p>
          <h1>Mercado</h1>
          <p>
            Vendas e faturamento por dia dos anúncios que você abriu no Mercado Livre, de qualquer
            vendedor. Cada nova visita a um anúncio deixa a medição mais precisa.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="secondary" href="/extensao">
            Instalar extensão
          </Link>
        </div>
      </header>

      {data && (
        <section className="market-strip" aria-label="Resumo da medição">
          <div className="market-strip__cell">
            <span>Itens monitorados</span>
            <strong className="num">{n(total, 0)}</strong>
            <small>{all.length < total ? `mostrando os ${n(all.length, 0)} mais recentes` : "todos na lista"}</small>
          </div>
          <div className="market-strip__cell">
            <span>Com ritmo medido</span>
            <strong className="num">{n(measured, 0)}</strong>
            <small>duas ou mais leituras em dias diferentes</small>
          </div>
          <div className="market-strip__cell">
            <span>Em estimativa</span>
            <strong className="num">{n(estimated, 0)}</strong>
            <small>vendidos ÷ idade do anúncio</small>
          </div>
          <div className="market-strip__cell">
            <span>Sua conta</span>
            <strong className="num">{n(data.summary.ownItems, 0)}</strong>
            <small>
              {conversion?.source === "SUA_CONTA"
                ? `calibram a conversão: ${n(conversion.value * 100)}%`
                : "sincronize em Integrações para calibrar"}
            </small>
          </div>
        </section>
      )}

      {error && <div className="error" role="alert">{error}</div>}

      <section className="clean-panel market-list" aria-label="Anúncios observados">
        <div className="market-toolbar">
          <div className="market-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título ou código MLB"
              aria-label="Buscar anúncio observado"
            />
          </div>

          <div className="market-seg" role="radiogroup" aria-label="De quem são os anúncios">
            {(
              [
                ["all", "Todos"],
                ["own", "Meus"],
                ["market", "Mercado"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                className={scope === value ? "is-on" : undefined}
                onClick={() => setScope(value)}
              >
                {label} <em>{scopeCount(value)}</em>
              </button>
            ))}
          </div>

          <label className="market-sort">
            <span>Ordenar</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="market-switches" role="group" aria-label="Filtros">
          {SWITCHES.map(({ key, label }) => {
            const on = sw[key];
            const count = switchCount(key);
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={on}
                disabled={!on && count === 0}
                className="market-switch"
                onClick={() => setSw((cur) => ({ ...cur, [key]: !cur[key] }))}
              >
                <i aria-hidden="true" />
                {label}
                <em>{count}</em>
              </button>
            );
          })}
          {(activeSwitches > 0 || scope !== "all" || query) && (
            <button type="button" className="market-clear" onClick={resetFilters}>
              Limpar filtros
            </button>
          )}
          <span className="market-count" aria-live="polite">
            {rows.length} {rows.length === 1 ? "anúncio" : "anúncios"}
          </span>
        </div>

        {loading && !data ? (
          <div className="clean-loading market-inset">Carregando anúncios observados…</div>
        ) : all.length === 0 ? (
          <div className="module-empty market-inset">
            <strong>{query ? "Nenhum anúncio com esse termo" : "Nenhum anúncio observado ainda"}</strong>
            <p>
              {query
                ? "Tente outro termo."
                : "Com a extensão instalada, navegue por buscas e anúncios no Mercado Livre. Cada página que você abrir aparece aqui com vendas e faturamento por dia."}
            </p>
            {!query && (
              <Link className="primary" href="/extensao">
                Instalar a extensão
              </Link>
            )}
          </div>
        ) : (
          <>
            {noRhythm > 0 && (
              <p className="market-note" role="note">
                <strong>
                  {noRhythm} {noRhythm === 1 ? "anúncio ainda sem ritmo" : "anúncios ainda sem ritmo"}.
                </strong>{" "}
                Abra {noRhythm === 1 ? "o anúncio" : "os anúncios"} de novo em outro dia e o Radar mede as vendas
                por dia. Até lá, mostramos só o acumulado (vendidos × preço), que não é por dia.
              </p>
            )}

            {rows.length === 0 ? (
              <div className="module-empty market-inset">
                <strong>Nenhum anúncio com esses filtros</strong>
                <p>Desligue algum filtro para ver mais anúncios.</p>
                <button type="button" className="secondary inline" onClick={resetFilters}>
                  Limpar filtros
                </button>
              </div>
            ) : (
              <>
              <div className="market-colhead" aria-hidden="true">
                <span className="market-colhead__thumb" />
                <span className="market-colhead__main">Anúncio</span>
                <span className="market-cell--price">Preço</span>
                {cols.demand && <span className="market-cell--demand">Demanda</span>}
                {cols.revenue && <span className="market-colhead__cell">Faturamento ~/dia</span>}
                {cols.sales && <span className="market-colhead__cell">Vendas ~/dia</span>}
                <span className="market-cell--conf">Confiança</span>
                <span className="market-colhead__chev" />
              </div>
              <ol className="market-rows">
                {rows.map((item) => {
                  const e = item.estimate;
                  const tier = tierOf(item);
                  const open = selected === item.id;
                  const acc = accumulated(item);
                  const rev = e.revenuePerDay.value;
                  const sales = e.salesPerDay.value;
                  return (
                    <li key={item.id} className={"market-row" + (open ? " is-open" : "")}>
                      <button
                        type="button"
                        className="market-row__head"
                        aria-expanded={open}
                        aria-controls={"detail-" + item.id}
                        onClick={() => setSelected(open ? null : item.id)}
                      >
                        <span className="market-thumb">
                          {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : <b aria-hidden="true">MR</b>}
                        </span>
                        <span className="market-main">
                          <strong>{item.title}</strong>
                          <span className="market-meta">
                            <span>{item.isOwn ? "Seu anúncio" : (item.sellerName ?? item.id)}</span>
                            {item.catalogProductId && <em>Catálogo</em>}
                            {item.fulfillment && <em className="is-full">Full</em>}
                            {item.freeShipping && <em>Frete grátis</em>}
                            <small>visto {relative(item.lastSeenAt)}</small>
                          </span>
                        </span>
                        <span className="market-cells">
                        <span className="market-cell market-cell--price" data-label="Preço">
                          <b className="num">{item.price == null ? "sem preço" : brl.format(item.price)}</b>
                        </span>
                        {cols.demand && (
                          <span className="market-cell market-cell--demand" data-label="Demanda">
                            {item.demand ? (
                              <span className={"market-pill is-" + item.demand.toLowerCase()}>
                                {DEMAND_TEXT[item.demand]}
                              </span>
                            ) : null}
                          </span>
                        )}
                        {cols.revenue && (
                          <span className="market-cell" data-label="Faturamento por dia">
                            {rev != null ? (
                              <>
                                <b className="num">~{money(rev)}</b>
                                <small>{span(e.revenuePerDay, money) ?? "por dia"}</small>
                              </>
                            ) : acc != null ? (
                              <>
                                <b className="num is-acc">{money(acc)}</b>
                                <small>acumulado</small>
                              </>
                            ) : (
                              <small className="market-none">sem ritmo</small>
                            )}
                          </span>
                        )}
                        {cols.sales && (
                          <span className="market-cell" data-label="Vendas por dia">
                            {sales != null ? (
                              <>
                                <b className="num">~{n(sales)}</b>
                                <small>{span(e.salesPerDay, (v) => n(v)) ?? "por dia"}</small>
                              </>
                            ) : (
                              <small className="market-none">sem ritmo</small>
                            )}
                          </span>
                        )}
                        <span className="market-cell market-cell--conf" data-label="Confiança">
                          <ConfidenceCell item={item} />
                        </span>
                        </span>
                        <span className="market-chev" aria-hidden="true" />
                      </button>

                      {open && (
                        <div className="market-detail" id={"detail-" + item.id}>
                          {detailError && <div className="error">{detailError}</div>}
                          {!detail && !detailError && <div className="clean-loading">Carregando histórico…</div>}
                          {detail && detail.insight.id === item.id && <DetailBody detail={detail} tier={tier} />}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              </>
            )}
          </>
        )}
      </section>

      {data && (
        <p className="market-footnote">
          Os números de outros vendedores são estimativas: a API do Mercado Livre só libera vendas e visitas
          exatas dos seus próprios anúncios. O Radar mede o ritmo pela diferença entre leituras da página
          (avaliações e faixa de vendidos) e mostra a faixa provável. O til (~) marca todo número estimado.
        </p>
      )}
    </section>
  );
}

function DetailBody({ detail, tier }: { detail: Detail; tier: Tier }) {
  const { insight, series } = detail;
  const e = insight.estimate;
  const acc = accumulated(insight);
  const reviewsPts = series.filter((p) => p.reviews != null).map((p) => ({ at: p.at, value: p.reviews as number }));
  const pricePts = series.filter((p) => p.price != null).map((p) => ({ at: p.at, value: p.price as number }));
  const soldPts = series
    .filter((p) => (p.soldExact ?? p.soldLower) != null)
    .map((p) => ({ at: p.at, value: (p.soldExact ?? p.soldLower) as number }));
  const charts = [
    { title: "Vendidos acumulados", points: soldPts, format: (v: number) => n(v, 0) },
    { title: "Avaliações acumuladas", points: reviewsPts, format: (v: number) => n(v, 0) },
    { title: "Preço", points: pricePts, format: (v: number) => brl.format(v) },
  ].filter((c) => c.points.length >= 2 && new Set(c.points.map((p) => p.value)).size >= 2);

  const readouts = [
    e.salesPerDay.value != null && {
      label: "Vendas por dia",
      value: "~" + n(e.salesPerDay.value),
      sub: span(e.salesPerDay, (v) => n(v)),
      tip: "Avaliações novas por dia × vendas por avaliação do anúncio, ou vendidos ÷ idade.",
    },
    e.revenuePerDay.value != null
      ? {
          label: "Faturamento por dia",
          value: "~" + money(e.revenuePerDay.value),
          sub: span(e.revenuePerDay, money),
          tip: "Vendas por dia × preço atual.",
        }
      : acc != null && {
          label: "Faturamento acumulado",
          value: money(acc),
          sub: "piso de vendidos × preço",
          tip: "Não é por dia: é o mínimo de vendidos que a página mostra vezes o preço.",
        },
    e.visitsPerDay.value != null && {
      label: "Visitas por dia",
      value: "~" + n(e.visitsPerDay.value, 0),
      sub: span(e.visitsPerDay, (v) => n(v, 0)),
      tip: "Vendas por dia ÷ conversão.",
    },
  ].filter(Boolean) as Array<{ label: string; value: string; sub: string | null; tip: string }>;

  return (
    <div className="market-detail__grid">
      <div className="market-detail__col">
        <div className="market-detail__tags">
          <span className={"market-tier is-" + tier.toLowerCase()} title={TIER[tier].hint}>
            {TIER[tier].label}
          </span>
          <span>{CONFIDENCE[e.confidence]}</span>
          <span>{insight.id}</span>
          {insight.permalink && (
            <a href={insight.permalink} target="_blank" rel="noreferrer" className="inline-link-button">
              Abrir no Mercado Livre
            </a>
          )}
        </div>

        {readouts.length > 0 && (
          <div className="market-readouts">
            {readouts.map((r) => (
              <div key={r.label} title={r.tip}>
                <span>{r.label}</span>
                <strong className="num">{r.value}</strong>
                <small>{r.sub ?? " "}</small>
              </div>
            ))}
          </div>
        )}

        <dl className="market-facts">
          {e.sold.lower != null && (
            <div>
              <dt>Vendidos no total</dt>
              <dd>
                {e.sold.exact ? n(e.sold.lower, 0) : `${n(e.sold.lower, 0)} a ${n(e.sold.upper, 0)}`}
              </dd>
            </div>
          )}
          {insight.reviews != null && (
            <div>
              <dt>Avaliações</dt>
              <dd>
                {n(insight.reviews, 0)}
                {insight.rating != null ? ` · nota ${n(insight.rating)}` : ""}
              </dd>
            </div>
          )}
          {e.ageDays.value != null && (
            <div>
              <dt>Idade do anúncio</dt>
              <dd>
                {n(e.ageDays.value, 0)} dias{e.ageDays.source === "ID_ESTIMADO" ? " (estimada)" : ""}
              </dd>
            </div>
          )}
          {e.visitsPerDay.value != null && (
            <div>
              <dt>Conversão usada</dt>
              <dd>{n(e.conversion.value * 100)}%</dd>
            </div>
          )}
          <div>
            <dt>Primeira leitura</dt>
            <dd>{new Date(insight.firstSeenAt).toLocaleDateString("pt-BR")}</dd>
          </div>
          <div>
            <dt>Leituras</dt>
            <dd>{n(series.length, 0)}</dd>
          </div>
        </dl>
      </div>

      <div className="market-detail__col">
        {charts.length > 0 ? (
          <div className="market-charts">
            {charts.map((c) => (
              <div key={c.title}>
                <SeriesChart title={c.title} points={c.points} format={c.format} emptyText="" />
              </div>
            ))}
          </div>
        ) : (
          <p className="market-detail__empty">
            Este anúncio tem {series.length === 1 ? "só 1 leitura" : "poucas leituras"}. Abra-o de novo em outro dia
            para o Radar desenhar o histórico de vendidos, avaliações e preço.
          </p>
        )}

        <section className="market-basis">
          <strong>Como o Radar calculou</strong>
          <ul>
            {e.basis.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
