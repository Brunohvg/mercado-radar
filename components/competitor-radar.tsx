"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  classifyCompetitor,
  MATCH_LABELS,
  type Competitor,
  type MatchLevel,
} from "@/lib/competitor-analysis";
import { researchPayloadSchema } from "@/lib/intelligence-validation";
import {
  IntelligenceDrafts,
  type IntelligenceDraft,
} from "@/components/intelligence-drafts";

type Research = {
  query: string;
  referenceId: string | null;
  items: Competitor[];
  notices: { code: string; message: string }[];
  scope: string;
  paging: { nextOffset: number | null; hasMore: boolean; total: number | null };
};
const money = (v: number | null, unit = false) =>
  v == null
    ? "Não disponível"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: unit ? 4 : 2,
      });
const sold = (i: Competitor) =>
  i.sold == null
    ? "Não disponível"
    : `${i.sold.toLocaleString("pt-BR")}${i.soldIsLowerBound ? "+" : ""} vendidos no total`;
function shipping(i: Competitor) {
  return [
    i.fulfillment ? "Full" : null,
    i.freeShipping === true
      ? "Frete grátis ao comprador"
      : i.freeShipping === false
        ? "Sem frete grátis indicado"
        : "Envio não disponível",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CompetitorRadar() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<Research | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, MatchLevel>>({});
  const [filter, setFilter] = useState("ALL");
  const [full, setFull] = useState(false);
  const [sort, setSort] = useState("unit");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [watching, setWatching] = useState<string | null>(null);
  const sequence = useRef(0);
  const activeQuery = useRef({ query: "", category: "" });
  const comparison = useRef<HTMLElement>(null);
  const reference =
    result?.items.find((i) => i.id === referenceId) ?? result?.items[0] ?? null;
  const rows = useMemo(() => {
    if (!result || !reference) return [];
    return result.items
      .map((item) => {
        const auto = classifyCompetitor(reference, item);
        const level = overrides[item.id] ?? auto.level;
        return { item, auto, level };
      })
      .filter(
        (r) =>
          (filter === "ALL" || r.level === filter) &&
          (!full || r.item.fulfillment),
      )
      .sort((a, b) => {
        const av = sort === "unit" ? a.item.unitPrice : a.item.price,
          bv = sort === "unit" ? b.item.unitPrice : b.item.price;
        return av == null ? (bv == null ? 0 : 1) : bv == null ? -1 : av - bv;
      });
  }, [result, reference, overrides, filter, full, sort]);
  async function search(
    q: string,
    cat: string,
    offset = 0,
    restore?: ReturnType<typeof researchPayloadSchema.parse>,
  ) {
    const seq = ++sequence.current;
    setBusy(true);
    setMessage("");
    if (!offset) {
      setResult(null);
      setSelected([]);
      setOverrides({});
      setReferenceId(null);
    }
    try {
      const params = new URLSearchParams({ q, offset: String(offset) });
      if (cat.trim()) params.set("category", cat.trim().toUpperCase());
      const response = await fetch("/api/intelligence/competitors?" + params, {
        cache: "no-store",
      });
      const body = (await response.json()) as Research & { error?: string };
      if (seq !== sequence.current) return;
      if (!response.ok)
        throw new Error(body.error ?? "Busca indisponível. Tente novamente.");
      activeQuery.current = { query: q, category: cat };
      setResult((prev) =>
        offset && prev
          ? {
              ...body,
              items: [
                ...new Map(
                  [...prev.items, ...body.items].map((i) => [i.id, i]),
                ).values(),
              ],
            }
          : body,
      );
      if (!offset) {
        setReferenceId(
          restore?.referenceId ?? body.referenceId ?? body.items[0]?.id ?? null,
        );
        setSelected(
          restore?.selectedIds.filter((id) =>
            body.items.some((i) => i.id === id),
          ) ?? [],
        );
        setOverrides(
          Object.fromEntries(
            restore?.overrides.map((o) => [o.id, o.level]) ?? [],
          ),
        );
        if (restore)
          setMessage(
            "Pesquisa reaberta e consultada novamente. Anúncios indisponíveis saem da seleção; revise a correspondência.",
          );
      }
    } catch (error) {
      if (seq === sequence.current) setMessage((error as Error).message);
    } finally {
      if (seq === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setQuery(q);
      void search(q, "");
    }
    return () => {
      sequence.current++;
    };
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    setFilter("ALL");
    setFull(false);
    void search(query, category);
  }
  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : prev.length < 4
          ? [...prev, id]
          : prev,
    );
  }
  async function monitor(item: Competitor) {
    setWatching(item.id);
    setMessage("");
    try {
      const url =
        item.source === "RADAR_OBSERVATION"
          ? "/api/intelligence/competitors/watch"
          : "/api/monitoring/watchlist";
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(
        body.message ??
          "Anúncio salvo no Monitoramento. A atualização depende do acesso autorizado pela API.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWatching(null);
    }
  }
  function openDraft(draft: IntelligenceDraft) {
    const parsed = researchPayloadSchema.safeParse(draft.payload);
    if (!parsed.success) {
      setMessage("Este rascunho não é compatível com a versão atual.");
      return;
    }
    setQuery(parsed.data.query);
    setCategory(parsed.data.categoryId);
    void search(parsed.data.query, parsed.data.categoryId, 0, parsed.data);
  }
  const picked = selected
    .map((id) => result?.items.find((i) => i.id === id))
    .filter((i): i is Competitor => Boolean(i));
  return (
    <div className="intel-workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">Pesquisa competitiva</p>
          <h1>Compare o produto certo</h1>
          <p>
            Veja quanto custa cada unidade e o que realmente coincide entre as
            ofertas.
          </p>
        </div>
        <Link className="secondary" href={reference && /^MLB\d+$/.test(reference.id) ? "/kits?ref="+reference.id : "/kits"}>
          Simular kits →
        </Link>
      </header>
      <form className="intel-search" onSubmit={submit}>
        <label>
          Produto, SKU cadastrado, código MLB ou link
          <input
            name="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            minLength={2}
            maxLength={240}
            placeholder="Ex.: Caneta Fantasminha Montovani"
          />
        </label>
        <button className="primary" disabled={busy || query.trim().length < 2}>
          {busy ? "Buscando…" : "Pesquisar"}
        </button>
        <details>
          <summary>Filtrar por categoria</summary>
          <label>
            Código da categoria (opcional)
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="MLB…"
            />
          </label>
        </details>
      </form>
      {message && (
        <p className="intel-notice" role="status">
          {message}
        </p>
      )}
      {result?.notices.map((notice, index) => (
        <p className="intel-notice" key={index}>
          {notice.message}
        </p>
      ))}
      {result && (
        <>
          <div className="intel-toolbar">
            <div>
              <strong>{rows.length} oferta(s) nesta amostra</strong>
              <p>{result.scope}</p>
            </div>
            <div className="intel-filters">
              <label>
                Correspondência
                <select
                  aria-label="Filtrar por correspondência"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="ALL">Todas</option>
                  {Object.entries(MATCH_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ordenar
                <select
                  aria-label="Ordenar ofertas"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="unit">Menor preço por unidade</option>
                  <option value="price">Menor preço total</option>
                </select>
              </label>
              <label className="intel-check">
                <input
                  type="checkbox"
                  checked={full}
                  onChange={(e) => setFull(e.target.checked)}
                />
                Full
              </label>
            </div>
          </div>
          {reference && (
            <p className="intel-reference">
              Referência: <strong>{reference.title}</strong> ·{" "}
              {reference.quantity == null
                ? "Quantidade não confirmada"
                : `${reference.quantity} unidades`}
              <br />
              <small>
                A classificação é revisável. Título semelhante e preço unitário
                não comprovam o mesmo produto.
              </small>
            </p>
          )}
          {selected.length > 0 && (
            <div className="intel-selection">
              <strong>{selected.length}/4 selecionados</strong>
              <button
                className="secondary"
                onClick={() =>
                  comparison.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                Ver comparação
              </button>
              <button className="text-button" onClick={() => setSelected([])}>
                Limpar
              </button>
            </div>
          )}
          <div className="intel-offers" aria-busy={busy}>
            {rows.map(({ item, auto, level }) => (
              <article key={item.id} className="intel-offer">
                <div className="intel-offer-title">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      width={56}
                      height={56}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="intel-image-placeholder"
                      aria-hidden="true"
                    >
                      ◎
                    </span>
                  )}
                  <div>
                    <h2>
                      {item.permalink ? (
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </h2>
                    <small>
                      {item.id}
                      {item.isOwn ? " · Meu anúncio" : ""}
                    </small>
                    <p>
                      {[item.brand, item.model, item.color]
                        .filter(Boolean)
                        .join(" · ") || "Marca e modelo não disponíveis"}
                    </p>
                  </div>
                </div>
                <div className="intel-price">
                  <strong>{money(item.unitPrice, true)}</strong>
                  <span>por unidade · {item.quantity ?? "?"} un.</span>
                  <small>{money(item.price)} o anúncio</small>
                </div>
                <div className="intel-match">
                  <span className="intel-pill">
                    {MATCH_LABELS[level]}
                    {overrides[item.id] ? " · revisado" : ""}
                  </span>
                  <small>{shipping(item)}</small>
                  <details>
                    <summary>Conferir dados e correspondência</summary>
                    <p>{auto.reasons.join(" ")}</p>
                    <label>
                      Sua classificação
                      <select
                        value={level}
                        aria-label={`Correspondência ${item.id}`}
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [item.id]: e.target.value as MatchLevel,
                          }))
                        }
                      >
                        {Object.entries(MATCH_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      onClick={() =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          delete next[item.id];
                          return next;
                        })
                      }
                    >
                      Voltar à leitura automática
                    </button>
                    <p>
                      Unidades:{" "}
                      {item.quantitySource === "ATTRIBUTE"
                        ? "atributo da API"
                        : item.quantitySource === "TITLE"
                          ? "título, confira o pacote"
                          : "Não disponível"}
                    </p>
                    <p>Vendas: {sold(item)}</p>
                    <p>Reputação: {item.reputation ?? "Não disponível"}</p>
                    <p>
                      Modalidade:{" "}
                      {item.listingType === "gold_special"
                        ? "Clássico"
                        : item.listingType === "gold_pro"
                          ? "Premium"
                          : "Não disponível"}
                    </p>
                    <p>
                      Fonte:{" "}
                      {item.source === "ML_API"
                        ? "API Mercado Livre"
                        : "Leitura salva pelo Radar"}{" "}
                      · {new Date(item.observedAt).toLocaleString("pt-BR")}
                    </p>
                  </details>
                </div>
                <div className="intel-offer-actions">
                  <label className="intel-check">
                    <input
                      type="checkbox"
                      aria-label={`Comparar ${item.id}`}
                      checked={selected.includes(item.id)}
                      disabled={
                        !selected.includes(item.id) && selected.length >= 4
                      }
                      onChange={() => toggle(item.id)}
                    />
                    Comparar
                  </label>
                  <button
                    className="text-button"
                    disabled={reference?.id === item.id}
                    onClick={() => {
                      setReferenceId(item.id);
                      setOverrides({});
                    }}
                  >
                    Usar como referência
                  </button>
                  <button
                    className="text-button"
                    disabled={watching !== null}
                    onClick={() => monitor(item)}
                  >
                    {watching === item.id ? "Salvando…" : "Monitorar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!rows.length && (
            <div className="intel-empty">
              <h2>Nenhuma oferta disponível nesta amostra</h2>
              <p>
                Revise os filtros. Se a API restringiu a consulta, abra a
                pesquisa no Mercado Livre com a extensão e depois pesquise
                novamente aqui.
              </p>
              <Link className="secondary" href="/extensao">
                Conferir extensão
              </Link>
            </div>
          )}
          {result.paging.hasMore && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                search(
                  activeQuery.current.query,
                  activeQuery.current.category,
                  result.paging.nextOffset ?? 0,
                )
              }
            >
              Carregar mais ofertas
            </button>
          )}
          {picked.length > 0 && (
            <section
              className="intel-comparison"
              ref={comparison}
              aria-label="Comparação dos selecionados"
            >
              <h2>Compare lado a lado</h2>
              <p>
                Revise marca, modelo, cor e quantidade antes de escolher uma
                referência de preço.
              </p>
              <div className="intel-compare-grid">
                {picked.map((i) => (
                  <article key={i.id}>
                    <h3>{i.title}</h3>
                    <dl>
                      <dt>Por unidade</dt>
                      <dd>{money(i.unitPrice, true)}</dd>
                      <dt>Quantidade / total</dt>
                      <dd>
                        {i.quantity ?? "Não disponível"} un. · {money(i.price)}
                      </dd>
                      <dt>Marca / modelo</dt>
                      <dd>
                        {i.brand ?? "Não disponível"} /{" "}
                        {i.model ?? "Não disponível"}
                      </dd>
                      <dt>Cor</dt>
                      <dd>{i.color ?? "Não disponível"}</dd>
                      <dt>Envio</dt>
                      <dd>{shipping(i)}</dd>
                      <dt>Vendidos acumulados</dt>
                      <dd>{sold(i)}</dd>
                    </dl>
                    <button
                      className="text-button"
                      onClick={() => toggle(i.id)}
                    >
                      Remover da comparação
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {!result && !busy && (
        <div className="intel-empty">
          <h2>Comece pelo produto que você conhece</h2>
          <p>
            Pesquise por nome ou cole um anúncio. Compare kits pela quantidade
            antes de decidir pelo menor preço.
          </p>
        </div>
      )}
      <IntelligenceDrafts
        kind="RESEARCH"
        name={result?.query ?? query}
        canSave={Boolean(result?.items.length)}
        payload={{
          query: activeQuery.current.query,
          categoryId: activeQuery.current.category,
          referenceId,
          selectedIds: selected,
          overrides: Object.entries(overrides).map(([id, level]) => ({
            id,
            level,
          })),
        }}
        onOpen={openDraft}
      />
    </div>
  );
}
