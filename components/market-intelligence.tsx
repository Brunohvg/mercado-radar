"use client";

import Link from "next/link";
import { assessMarket, compactMoney } from "@/lib/market-assessment";
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
  score: number | null;
  demand: "BAIXA" | "MEDIA" | "ALTA" | "EXCELENTE" | null;
};

type ListPayload = {
  items: Insight[];
  summary: {
    marketItems: number;
    ownItems: number;
    snapshots: number;
    withHistory: number;
  };
  calibration: {
    conversion: {
      value: number;
      low: number;
      high: number;
      source: "SUA_CONTA" | "PADRAO";
      sample: number;
    };
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

const CONFIDENCE = [
  "Só acumulado",
  "Confiança baixa",
  "Confiança média",
  "Confiança alta",
];

type Tier = "MEDIDO" | "ESTIMADO" | "ACUMULADO";

const TIER: Record<Tier, { label: string; hint: string }> = {
  MEDIDO: {
    label: "Medido",
    hint: "Ritmo medido pela diferença entre leituras do Radar, ou pedidos reais da sua conta.",
  },
  ESTIMADO: {
    label: "Estimado",
    hint: "Vendidos acumulados divididos pela idade do anúncio: uma média desde a criação.",
  },
  ACUMULADO: {
    label: "Acumulado",
    hint: "Só o total de vendidos que a página mostra. O ritmo por dia ainda não pôde ser medido.",
  },
};

const SORTS = {
  potential: "Potencial de mercado",
  sold: "Mais vendidos no total",
  revenue: "Maior receita de referência",
  sales: "Maior ritmo medido",
  recent: "Visto recentemente",
  priceAsc: "Menor preço",
  priceDesc: "Maior preço",
} as const;
type SortKey = keyof typeof SORTS;
type Scope = "all" | "own" | "market";
function assessment(item: Insight) {
  return assessMarket(item, item);
}
function tierOf(item: Insight): Tier {
  const a = assessment(item);
  return a.measured.level
    ? item.estimate.method === "VIDA"
      ? "ESTIMADO"
      : "MEDIDO"
    : "ACUMULADO";
}
function accumulated(item: Insight): number | null {
  return assessment(item).reference?.value ?? null;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function n(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("pt-BR");
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1e6)
    return (
      "R$ " +
      (value / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
      " mi"
    );
  if (value >= 1e5)
    return "R$ " + Math.round(value / 1e3).toLocaleString("pt-BR") + " mil";
  if (value >= 100) return "R$ " + Math.round(value).toLocaleString("pt-BR");
  return brl.format(value).replace(/,00$/, "");
}

function span(range: Range, format: (v: number) => string) {
  if (range.low == null || range.high == null) return null;
  if (Math.abs(range.high - range.low) < 1e-9) return null;
  return `${format(range.low)} a ${format(range.high)}`.replace(
    /^R\$ (.+) a R\$ /,
    "R$ $1 a ",
  );
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
  const x = (t: number) =>
    pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) =>
    pad.t + (1 - (v - v0) / (v1 - v0)) * (H - pad.t - pad.b);
  const path = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`,
    )
    .join(" ");
  const active = Math.min(hover ?? points.length - 1, points.length - 1);
  const date = (t: number) =>
    new Date(t).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });

  return (
    <figure className="market-chart">
      <figcaption>
        <span>{title}</span>
        <strong className="num">{format(points[active].value)}</strong>
        <small>
          {new Date(points[active].at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}: de ${format(values[0])} para ${format(values[values.length - 1])}`}
        onMouseLeave={() => setHover(null)}
      >
        <line
          className="market-chart__base"
          x1={pad.l}
          x2={W - pad.r}
          y1={H - pad.b}
          y2={H - pad.b}
        />
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
              className={
                "market-chart__dot" + (i === active ? " is-active" : "")
              }
              cx={x(times[i])}
              cy={y(p.value)}
              r={i === active ? 4.5 : 2.5}
            />
          </g>
        ))}
        <text className="market-chart__tick" x={pad.l} y={H - 4}>
          {date(t0)}
        </text>
        <text
          className="market-chart__tick"
          x={W - pad.r}
          y={H - 4}
          textAnchor="end"
        >
          {date(t1)}
        </text>
      </svg>
    </figure>
  );
}

function DemandReading({ item }: { item: Insight }) {
  const { demand: d, soldText } = assessment(item);
  return (
    <span className="market-reading" title={d.basis}>
      <b className={"market-pill is-" + (d.level?.toLowerCase() ?? "none")}>
        {d.text}
      </b>
      <small>
        {d.label}
        {d.lowerBound ? " · mínima" : ""}
      </small>
      <small>{d.rate != null ? `${n(d.rate)} un./dia` : soldText}</small>
    </span>
  );
}
function PotentialReading({ item }: { item: Insight }) {
  const p = assessment(item).potential;
  return (
    <span className={"market-potential is-" + p.tone} title={p.reason}>
      {p.title}
    </span>
  );
}
function RevenueReading({ item }: { item: Insight }) {
  const a = assessment(item);
  return (
    <span
      className="market-reading"
      title={
        a.reference
          ? a.reference.basis + ". " + a.reference.detail
          : "Falta preço ou quantidade vendida."
      }
    >
      <b>{a.reference?.text ?? "—"}</b>
      <small>receita de referência</small>
      {a.recent && a.demand.rate != null && item.price != null && (
        <small>{compactMoney(a.demand.rate * item.price)} est./dia</small>
      )}
    </span>
  );
}
function ProductIdentity({ item }: { item: Insight }) {
  return (
    <div className="market-identity">
      <div className="market-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">◎</span>
        )}
      </div>
      <div>
        <h3>{item.title}</h3>
        <small>
          {item.id}
          {item.sellerName ? ` · ${item.sellerName}` : ""}
        </small>
        <div className="market-tags">
          {item.isOwn && <span>Meu anúncio</span>}
          {item.fulfillment && <span className="is-full">Full</span>}
          {item.catalogProductId && <span>Catálogo</span>}
          {item.freeShipping && <span>Frete grátis</span>}
        </div>
      </div>
    </div>
  );
}

export function MarketIntelligence() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("potential");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [potential, setPotential] = useState("all"),
    [demandFilter, setDemandFilter] = useState("all");
  const [full, setFull] = useState(false),
    [catalog, setCatalog] = useState(false),
    [measured, setMeasured] = useState(false);
  const [compared, setCompared] = useState<Insight[]>([]),
    [compareOpen, setCompareOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState("");
  const loadSeq = useRef(0);
  const detailRegion = useRef<HTMLElement>(null),
    compareRegion = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) {
      detailRegion.current?.focus({ preventScroll: true });
      detailRegion.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selected]);
  useEffect(() => {
    if (compareOpen)
      compareRegion.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [compareOpen]);
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial?.trim()) setQuery(initial.trim().slice(0, 120));
    const saved = window.localStorage.getItem("radar-market-view");
    if (saved === "cards" || saved === "table") setView(saved);
  }, []);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope: "all", limit: "200" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/market/items?${params}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Falha ao carregar o mercado.");
      if (seq === loadSeq.current) {
        setData(body);
        // Refresh selected facts when the same product is returned, preserving
        // selections outside the current search instead of silently replacing them.
        setCompared((previous) =>
          previous.map(
            (i) => body.items.find((fresh: Insight) => fresh.id === i.id) ?? i,
          ),
        );
      }
    } catch (caught) {
      if (seq === loadSeq.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "Falha ao carregar o mercado.",
        );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => {
      clearTimeout(timer);
      loadSeq.current++;
    };
  }, [load, query]);
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (!selected) return;
    let active = true;
    fetch(`/api/market/items/${selected}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Falha ao carregar o histórico.");
        if (active) setDetail(body);
      })
      .catch((caught) => {
        if (active)
          setDetailError(
            caught instanceof Error
              ? caught.message
              : "Falha ao carregar o histórico.",
          );
      });
    return () => {
      active = false;
    };
  }, [selected]);
  const all = useMemo(() => data?.items ?? [], [data]);
  const rows = useMemo(() => {
    const result = all.filter((i) => {
      const a = assessment(i);
      return (
        (scope !== "own" || i.isOwn) &&
        (scope !== "market" || !i.isOwn) &&
        (!full || i.fulfillment) &&
        (!catalog || i.catalogProductId) &&
        (!measured || a.recent) &&
        (potential === "all" || a.potential.key === potential) &&
        (demandFilter === "all" || a.demand.level === demandFilter)
      );
    });
    const numberOf = (i: Insight) => {
      const a = assessment(i);
      switch (sort) {
        case "sold":
          return a.sold ?? -1;
        case "revenue":
          return a.reference?.value ?? -1;
        case "sales":
          return a.recent ? (a.demand.rate ?? -1) : -1;
        case "recent":
          return new Date(i.lastSeenAt).getTime();
        case "priceAsc":
          return i.price != null ? -i.price : -Infinity;
        case "priceDesc":
          return i.price ?? -1;
        default:
          return a.potential.rank;
      }
    };
    return result.sort(
      (a, b) =>
        numberOf(b) - numberOf(a) ||
        (assessment(b).sold ?? -1) - (assessment(a).sold ?? -1) ||
        a.id.localeCompare(b.id),
    );
  }, [all, scope, sort, full, catalog, measured, potential, demandFilter]);
  const activeCount =
    Number(full) +
    Number(catalog) +
    Number(measured) +
    Number(potential !== "all") +
    Number(demandFilter !== "all") +
    Number(scope !== "all");
  const favorable = all.filter(
    (i) => assessment(i).potential.key === "favorable",
  ).length;
  function resetFilters() {
    setScope("all");
    setFull(false);
    setCatalog(false);
    setMeasured(false);
    setPotential("all");
    setDemandFilter("all");
  }
  function toggleCompare(item: Insight) {
    setCompared((current) =>
      current.some((i) => i.id === item.id)
        ? current.filter((i) => i.id !== item.id)
        : current.length < 4
          ? [...current, item]
          : current,
    );
  }
  function choose(item: Insight) {
    const checked = compared.some((i) => i.id === item.id);
    return (
      <label className="market-choose">
        <input
          type="checkbox"
          checked={checked}
          disabled={!checked && compared.length >= 4}
          onChange={() => toggleCompare(item)}
          aria-label={`Comparar ${item.title}`}
        />
        Comparar
      </label>
    );
  }
  return (
    <section className="market-page" aria-busy={loading}>
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Inteligência de mercado</p>
          <h1>Encontre seu próximo produto</h1>
          <p>
            Compare demanda, preço e potencial dos anúncios que você pesquisou.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="clean-secondary" href="/extensao">
            Usar extensão
          </Link>
          <Link
            className="clean-primary"
            href={
              query.trim()
                ? `/oportunidades?q=${encodeURIComponent(query.trim())}`
                : "/oportunidades"
            }
          >
            Pesquisar novos produtos →
          </Link>
        </div>
      </header>
      <div className="market-strip" aria-label="Resumo dos anúncios na amostra">
        {[
          ["Anúncios na amostra", all.length, "leituras salvas no Radar"],
          [
            "Potencial favorável",
            favorable,
            "volume histórico ou ritmo medido",
          ],
          [
            "Com ritmo recente",
            all.filter((i) => assessment(i).recent).length,
            "com período conhecido",
          ],
          [
            "Ofertas Full",
            all.filter((i) => i.fulfillment).length,
            "na amostra carregada",
          ],
        ].map(([label, value, sub]) => (
          <div className="market-strip__cell" key={label}>
            <span>{label}</span>
            <strong>{loading && !data ? "—" : value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {compared.length > 0 && (
        <section
          ref={compareRegion}
          className={
            "market-compare" +
            (compareOpen && compared.length >= 2 ? " is-open" : "")
          }
          aria-label="Comparação de produtos"
        >
          <div className="market-compare-head">
            <div>
              <strong>{compared.length} de 4 produtos selecionados</strong>
              <p>
                Compare lado a lado. Confira quantidade, marca e condição antes
                de tratar os produtos como equivalentes.
              </p>
            </div>
            <div className="market-compare-actions">
              <button
                disabled={compared.length < 2}
                onClick={() => setCompareOpen((v) => !v)}
              >
                {compareOpen ? "Recolher comparação" : "Comparar lado a lado"}
              </button>
              <button
                className="market-link"
                onClick={() => {
                  setCompared([]);
                  setCompareOpen(false);
                }}
              >
                Limpar
              </button>
            </div>
          </div>
          {compareOpen && compared.length >= 2 && (
            <div className="market-table-scroll">
              <table className="market-comparison-table">
                <thead>
                  <tr>
                    <th>Indicador</th>
                    {compared.map((item) => (
                      <th key={item.id}>
                        {item.title}
                        <button
                          className="market-link"
                          onClick={() => toggleCompare(item)}
                          aria-label={`Remover ${item.title}`}
                        >
                          Remover
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Preço</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        {i.price == null ? "—" : brl.format(i.price)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Potencial de mercado</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        <PotentialReading item={i} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Demanda e origem</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        <DemandReading item={i} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Receita de referência</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        <RevenueReading item={i} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Avaliação</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        {i.rating != null ? `${n(i.rating)} / 5` : "—"}
                        {i.reviews != null && (
                          <small>{n(i.reviews, 0)} avaliações</small>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Logística</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        {[
                          i.fulfillment ? "Full" : null,
                          i.freeShipping ? "Frete grátis" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Não informada"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Última leitura</th>
                    {compared.map((i) => (
                      <td key={i.id}>
                        {relative(i.lastSeenAt)}
                        {i.permalink && (
                          <a
                            href={i.permalink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir anúncio ↗
                          </a>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <section
        className="market-workspace clean-panel"
        aria-label="Anúncios observados"
      >
        <div className="market-toolbar">
          <label className="market-search">
            <span>Buscar nos anúncios salvos</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Produto ou código MLB"
            />
          </label>
          <label className="market-sort">
            <span>Ordenar por</span>
            <select
              aria-label="Ordenar por"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="market-seg" aria-label="Visualização">
            {(
              [
                ["cards", "Cards"],
                ["table", "Tabela"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => {
                  setView(key);
                  window.localStorage.setItem("radar-market-view", key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="market-filterbar">
          <label>
            <span>Potencial</span>
            <select
              aria-label="Filtrar por potencial"
              value={potential}
              onChange={(e) => setPotential(e.target.value)}
            >
              <option value="all">Todos os potenciais</option>
              <option value="favorable">Favorável</option>
              <option value="moderate">Moderado</option>
              <option value="caution">Exige atenção</option>
              <option value="initial">Em formação</option>
              <option value="unknown">Dados parciais</option>
            </select>
          </label>
          <label>
            <span>Demanda</span>
            <select
              aria-label="Filtrar por demanda"
              value={demandFilter}
              onChange={(e) => setDemandFilter(e.target.value)}
            >
              <option value="all">Todas as faixas</option>
              <option value="EXCELENTE">Excelente</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </label>
          <label>
            <span>Vendedor</span>
            <select
              aria-label="Filtrar por vendedor"
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
            >
              <option value="all">Todos</option>
              <option value="market">Outros vendedores</option>
              <option value="own">Meus anúncios</option>
            </select>
          </label>
          <div className="market-chips">
            {[
              ["Full", full, setFull],
              ["Catálogo", catalog, setCatalog],
              ["Ritmo recente", measured, setMeasured],
            ].map(([label, on, set]) => (
              <button
                key={label as string}
                type="button"
                aria-pressed={on as boolean}
                onClick={() => (set as (v: boolean) => void)(!on)}
              >
                {label as string}
              </button>
            ))}
          </div>
          {activeCount > 0 && (
            <button className="market-clear" onClick={resetFilters}>
              Limpar filtros ({activeCount})
            </button>
          )}
        </div>
        <div className="market-resultline">
          <span aria-live="polite">
            {loading
              ? "Atualizando anúncios…"
              : `${rows.length} de ${all.length} anúncios`}
            {data &&
            data.summary.marketItems + data.summary.ownItems > all.length
              ? " · amostra de até 200 resultados"
              : ""}
          </span>
          <details>
            <summary>Como ler os indicadores</summary>
            <p>
              <b>Histórica</b>: triagem pelo total de vendidos, sem previsão de
              giro. <b>Medida</b>: vendas em um período conhecido.{" "}
              <b>Receita de referência</b>: total público × preço atual, sem
              afirmar quanto o vendedor recebeu. Potencial de mercado não
              comprova lucro.
            </p>
          </details>
        </div>
        {!loading && rows.length === 0 ? (
          <div className="market-empty">
            <h2>
              {all.length
                ? "Nenhum anúncio com esses filtros"
                : "Comece por um produto que você quer vender"}
            </h2>
            <p>
              {all.length
                ? "Ajuste os filtros para ampliar a comparação."
                : "Pesquise novos produtos ou abra anúncios no Mercado Livre com a extensão. Suas leituras ficam organizadas aqui."}
            </p>
            {all.length ? (
              <button onClick={resetFilters}>Limpar filtros</button>
            ) : (
              <Link
                className="clean-primary"
                href={
                  query
                    ? `/oportunidades?q=${encodeURIComponent(query)}`
                    : "/oportunidades"
                }
              >
                Pesquisar produtos
              </Link>
            )}
          </div>
        ) : view === "cards" ? (
          <div className="market-card-grid">
            {rows.map((item) => (
              <article
                className="market-product"
                key={item.id}
                data-market-id={item.id}
              >
                <div className="market-product-top">
                  <PotentialReading item={item} />
                  {choose(item)}
                </div>
                <ProductIdentity item={item} />
                <div className="market-product-metrics">
                  <div>
                    <small>Preço de venda</small>
                    <strong>
                      {item.price == null ? "—" : brl.format(item.price)}
                    </strong>
                  </div>
                  <DemandReading item={item} />
                  <RevenueReading item={item} />
                </div>
                <p className="market-product-reason">
                  {assessment(item).potential.reason}
                </p>
                <footer>
                  <small>Leitura {relative(item.lastSeenAt)}</small>
                  <button
                    type="button"
                    className="market-link"
                    onClick={() => setSelected(item.id)}
                  >
                    Ver análise →
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="market-table-scroll">
            <table className="market-table">
              <thead>
                <tr>
                  <th>Comparar</th>
                  <th>Produto</th>
                  <th>Potencial</th>
                  <th>Demanda</th>
                  <th>Preço</th>
                  <th>Receita de referência</th>
                  <th>Análise</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} data-market-id={item.id}>
                    <td>{choose(item)}</td>
                    <td>
                      <ProductIdentity item={item} />
                    </td>
                    <td>
                      <PotentialReading item={item} />
                    </td>
                    <td>
                      <DemandReading item={item} />
                    </td>
                    <td>{item.price == null ? "—" : brl.format(item.price)}</td>
                    <td>
                      <RevenueReading item={item} />
                    </td>
                    <td>
                      <button
                        className="market-link"
                        onClick={() => setSelected(item.id)}
                      >
                        Ver análise
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <section
          ref={detailRegion}
          tabIndex={-1}
          className="market-detail clean-panel"
          aria-label="Análise do produto selecionado"
        >
          <div className="market-detail-heading">
            <h2>
              {detail?.insight.title ??
                all.find((i) => i.id === selected)?.title ??
                selected}
            </h2>
            <button
              onClick={() => {
                setSelected(null);
                document
                  .querySelector<HTMLButtonElement>(
                    `[data-market-id="${CSS.escape(selected)}"] .market-link`,
                  )
                  ?.focus();
              }}
              aria-label="Fechar análise"
            >
              Fechar ×
            </button>
          </div>
          {detailError ? (
            <p className="error" role="alert">
              {detailError}
            </p>
          ) : detail ? (
            <>
              <p className="market-detail-conclusion">
                <PotentialReading item={detail.insight} />{" "}
                {assessment(detail.insight).potential.reason}
              </p>
              <DetailBody detail={detail} tier={tierOf(detail.insight)} />
            </>
          ) : (
            <p role="status">Carregando histórico…</p>
          )}
        </section>
      )}
    </section>
  );
}
function DetailBody({ detail, tier }: { detail: Detail; tier: Tier }) {
  const { insight, series } = detail;
  const e = insight.estimate;
  const acc = accumulated(insight);
  const reviewsPts = series
    .filter((p) => p.reviews != null)
    .map((p) => ({ at: p.at, value: p.reviews as number }));
  const pricePts = series
    .filter((p) => p.price != null)
    .map((p) => ({ at: p.at, value: p.price as number }));
  const soldPts = series
    .filter((p) => (p.soldExact ?? p.soldLower) != null)
    .map((p) => ({ at: p.at, value: (p.soldExact ?? p.soldLower) as number }));
  const charts = [
    {
      title: "Vendidos acumulados",
      points: soldPts,
      format: (v: number) => n(v, 0),
    },
    {
      title: "Avaliações acumuladas",
      points: reviewsPts,
      format: (v: number) => n(v, 0),
    },
    { title: "Preço", points: pricePts, format: (v: number) => brl.format(v) },
  ].filter(
    (c) =>
      c.points.length >= 2 && new Set(c.points.map((p) => p.value)).size >= 2,
  );

  const readouts = [
    e.salesPerDay.value != null && {
      label: "Vendas por dia",
      value: "~" + n(e.salesPerDay.value),
      sub: span(e.salesPerDay, (v) => n(v)),
      tip: "Pedidos da sua conta ou mudança de contador exato no intervalo observado.",
    },
    e.revenuePerDay.value != null
      ? {
          label: "Receita estimada por dia",
          value: "~" + money(e.revenuePerDay.value),
          sub: span(e.revenuePerDay, money),
          tip: "Vendas por dia × preço atual.",
        }
      : acc != null && {
          label: "Receita de referência",
          value: assessment(insight).reference!.text,
          sub: assessment(insight).reference!.basis,
          tip: assessment(insight).reference!.detail,
        },
    e.visitsPerDay.value != null && {
      label: "Visitas por dia",
      value: "~" + n(e.visitsPerDay.value, 0),
      sub: span(e.visitsPerDay, (v) => n(v, 0)),
      tip: "Visitas oficiais no período informado, quando disponíveis.",
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    sub: string | null;
    tip: string;
  }>;

  return (
    <div className="market-detail__grid">
      <div className="market-detail__col">
        <div className="market-detail__tags">
          <span
            className={"market-tier is-" + tier.toLowerCase()}
            title={TIER[tier].hint}
          >
            {TIER[tier].label}
          </span>
          <span>{CONFIDENCE[e.confidence]}</span>
          <span>{insight.id}</span>
          {insight.permalink && (
            <a
              href={insight.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-link-button"
            >
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
                {e.sold.exact ? n(e.sold.lower, 0) : `${n(e.sold.lower, 0)}+`}
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
          {e.ageDays.value != null && e.ageDays.source === "API" && (
            <div>
              <dt>Idade do anúncio</dt>
              <dd>{n(e.ageDays.value, 0)} dias</dd>
            </div>
          )}
          {e.conversion.source === "OFICIAL" && (
            <div>
              <dt>Conversão da sua conta</dt>
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
                <SeriesChart
                  title={c.title}
                  points={c.points}
                  format={c.format}
                  emptyText=""
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="market-detail__empty">
            Este anúncio tem{" "}
            {series.length === 1 ? "só 1 leitura" : "poucas leituras"}. Abra-o
            de novo em outro dia para o Radar desenhar o histórico de vendidos,
            avaliações e preço.
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
