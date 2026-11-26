"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HunterPanel } from "./hunter-panel";
import { api, brl, dateBr, parseNumber, pct } from "./format";

type OpportunityRow = {
  id: string;
  title: string;
  brand: string | null;
  referencePrice: number | null;
  status: string;
  quoteCount: number;
  supplierCount: number;
  updatedAt: string;
};

type CapitalMatch = {
  opportunityId: string;
  title: string;
  reasons: string[];
  viability: {
    source: string;
    order: { minimumUnits: number; capital: number; units: number };
    perSale: { marginPercent: number; profit: number } | null;
  };
};

export function SourcingHome({ reference }: { reference: { id: string; title: string; price: number | null; observed: string; permalink: string | null } | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<OpportunityRow[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAllStudies, setShowAllStudies] = useState(false);
  const [hunterStarted, setHunterStarted] = useState(false);
  const queryRef = useRef<HTMLInputElement>(null);

  // Vem do "O que você quer revender?" do Início: link vai no campo de link,
  // texto livre no nome do produto.
  useEffect(() => {
    if (reference) return;
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!q) return;
    if (queryRef.current) { queryRef.current.value = q.slice(0, 300); queryRef.current.focus(); }
  }, [reference]);

  useEffect(() => {
    api<{ opportunities: OpportunityRow[] }>("/api/sourcing/opportunities")
      .then((body) => setRows(body.opportunities))
      .catch((caught: Error) => setError(caught.message));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("query") ?? "").trim();
    const isUrl = /^https?:\/\//i.test(query);
    const itemId = query.match(/^MLBU?-?\d{5,15}$/i)?.[0];
    let link: URL | null = null;
    if (isUrl) {
      try { link = new URL(query); } catch { /* Mensagem exibida abaixo. */ }
      const host = link?.hostname ?? "";
      if (!(host === "mercadolivre.com.br" || host.endsWith(".mercadolivre.com.br"))) {
        setError("Use um link do Mercado Livre ou escreva o nome do produto.");
        return;
      }
    }
    const code = (itemId ?? link?.pathname.match(/\bMLBU?-?\d{5,15}\b/i)?.[0])?.replace("-", "").toUpperCase();
    if (isUrl && !code) {
      setError("Abra o anúncio e copie o link com o código MLB ou MLBU. Você também pode buscar pelo nome.");
      return;
    }
    if (!reference && !code && query.length > 200) { setError("Use até 200 caracteres no nome do produto."); return; }
    if (query.length < 2) { setError("Informe o nome do produto ou o link do anúncio."); return; }
    const rawBudget = String(form.get("budget") ?? "").trim();
    const budget = parseNumber(rawBudget);
    if (rawBudget && (budget == null || budget <= 0)) { setError("Informe um orçamento maior que zero."); return; }
    const rawPrice = String(form.get("price") ?? "").trim();
    const price = parseNumber(rawPrice);
    if (rawPrice && (price == null || price <= 0)) { setError("Informe um preço de venda maior que zero."); return; }
    setCreating(true);
    setError("");
    try {
      const body = await api<{ opportunity: { id: string } }>("/api/sourcing/opportunities", {
        method: "POST",
        body: JSON.stringify({
          title: reference?.title.slice(0, 200) ?? (code ? `Anúncio ${code}` : query),
          mlItemId: reference?.id ?? code ?? null,
          permalink: reference?.permalink ?? link?.href ?? null,
          budget,
          referencePrice: price,
          referenceSource: price != null ? "MANUAL" : null,
        }),
      });
      router.push(`/onde-comprar/${body.opportunity.id}?buscar=1`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar.");
      setCreating(false);
    }
  }

  return (
    <div className="vr vr-sourcing-home">
      <header className="page-header clean-page-header vr-home-header">
        <div>
          <h1>Onde comprar</h1>
          <p>Encontre fornecedores, compare cotações e decida quanto investir.</p>
        </div>
      </header>

      <form className="vr-start" onSubmit={create}>
        <h2>Encontre fornecedores para um produto</h2>
        {reference && <p>{reference.id} · Leitura em {dateBr(reference.observed)} · Preço observado {brl(reference.price)}</p>}
        <div className="vr-start-row">
          <input ref={queryRef} readOnly={Boolean(reference)} defaultValue={reference?.title} name="query" required maxLength={500} aria-label="Link do anúncio ou nome do produto" placeholder="Cole o link do anúncio no Mercado Livre ou escreva o nome" />
          <button className="vr-btn" disabled={creating}>{creating ? "Preparando a busca…" : "Buscar fornecedores"}</button>
        </div>
        <details className="vr-home-options" open={reference ? true : undefined}>
          <summary>Orçamento e preço de venda (opcionais)</summary>
          <div className="vr-home-option-fields">
          <label>
            Quanto pode investir?<input name="budget" placeholder="R$ 500,00" inputMode="decimal" />
          </label>
          <label>
            Preço de venda para simular
            <input defaultValue={reference?.price ?? ""} name="price" placeholder="R$ 42,90" inputMode="decimal" />
          </label>
          </div>
        </details>
      </form>

      {error && <p className="vr-alert" role="alert">{error}</p>}

      {rows && rows.length > 0 && (
        <section className="vr-home-studies" aria-labelledby="vr-list">
          <header className="vr-card-head"><h2 id="vr-list">Seus estudos</h2><span className="vr-muted">{rows.length} {rows.length === 1 ? "produto" : "produtos"}</span></header>
          <ul className="vr-study-list">
            {(showAllStudies ? rows : rows.slice(0, 5)).map((row) => {
              const step = studyStep(row);
              return (
                <li key={row.id}>
                  <Link className="vr-study" href={`/onde-comprar/${row.id}`}>
                    <strong>{row.title}</strong>
                    <span className="vr-study-next">{step.next} →</span>
                    <small>
                      {row.supplierCount} fornecedor(es) · {row.quoteCount} cotação(ões) · {dateBr(row.updatedAt)}
                    </small>
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > 5 && <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" aria-expanded={showAllStudies} onClick={() => setShowAllStudies(!showAllStudies)}>{showAllStudies ? "Mostrar menos" : `Ver todos os ${rows.length} estudos`}</button>}
        </section>
      )}
      {rows?.length === 0 && <p className="vr-muted vr-home-empty">Seus estudos aparecerão aqui depois da primeira pesquisa.</p>}
      {!rows && !error && <p className="vr-muted" role="status">Carregando estudos…</p>}

      <section className="vr-home-tools" aria-labelledby="vr-tools-title">
        <h2 id="vr-tools-title">Outras formas de começar</h2>
        <details className="vr-home-tool" onToggle={(event) => { if (event.currentTarget.open) setHunterStarted(true); }}>
          <summary><strong>Descobrir produtos para revender</strong><span>Explore sinais de mercado nas suas categorias.</span></summary>
          {hunterStarted && <HunterPanel />}
        </details>
        <details className="vr-home-tool">
          <summary><strong>Encontrar opções pelo meu orçamento</strong><span>Compare os produtos já estudados com seu capital.</span></summary>
          <CapitalRadar />
        </details>
      </section>
    </div>
  );
}

function studyStep(row: OpportunityRow) {
  if (row.status === "VIAVEL") return { done: 3, next: "Marcado como viável" };
  if (row.status === "COMPRANDO") return { done: 3, next: "Comprando" };
  if (row.status === "DESCARTADA") return { done: 3, next: "Descartado" };
  if (row.quoteCount > 0) return { done: 2, next: "Ver o lucro" };
  if (row.supplierCount > 0) return { done: 1, next: "Pedir preço ao fornecedor" };
  return { done: 0, next: "Achar fornecedores" };
}

function CapitalRadar() {
  const [capital, setCapital] = useState(500);
  const [profile, setProfile] = useState("TODOS");
  const [margin, setMargin] = useState(20);
  const [result, setResult] = useState<{ matches: CapitalMatch[]; excluded: CapitalMatch[]; evaluated: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await api("/api/sourcing/capital", {
          method: "POST",
          body: JSON.stringify({ capital, profile, minMarginPercent: margin }),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na busca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vr-capital" aria-label="Quanto investir">
      <fieldset className="vr-chips">
        <legend>Quanto você tem para investir?</legend>
        {[200, 500, 1000, 2000, 5000].map((value) => (
          <button key={value} type="button" aria-pressed={capital === value} onClick={() => setCapital(value)}>
            {brl(value, 0)}
          </button>
        ))}
      </fieldset>
      <div className="vr-form vr-form--row">
        <label>
          Perfil do fornecedor
          <select value={profile} onChange={(event) => setProfile(event.target.value)}>
            <option value="TODOS">Todos os fornecedores</option>
            <option value="CPF">Que atendam CPF</option>
            <option value="CNPJ">Atacado para CNPJ</option>
            <option value="FABRICA">Direto da fábrica</option>
          </select>
        </label>
        <label>
          Margem desejada
          <select value={margin} onChange={(event) => setMargin(Number(event.target.value))}>
            {[10, 15, 20, 25, 30].map((value) => (
              <option key={value} value={value}>{value}%</option>
            ))}
          </select>
        </label>
      </div>
      <button className="vr-btn" type="button" onClick={run} disabled={busy}>
        {busy ? "Buscando…" : "Buscar oportunidades"}
      </button>
      {error && <p className="vr-alert" role="alert">{error}</p>}
      {result && (
        <div className="vr-capital-result">
          {result.evaluated === 0 && (
            <p className="vr-muted">Ainda não há produtos com custo de fornecedor registrado. Cadastre uma cotação para o Radar comparar.</p>
          )}
          {result.matches.map((match) => (
            <Link key={match.title} className="vr-capital-item" href={`/onde-comprar/${match.opportunityId}`}>
              <strong>{match.title}</strong>
              <span>
                Investimento simulado {brl(match.viability.order.capital)} · margem {pct(match.viability.perSale?.marginPercent)}
                {match.viability.source === "ESTIMATIVA_USUARIO" && " · custo estimado"}
              </span>
            </Link>
          ))}
          {result.evaluated > 0 && !result.matches.length && (
            <p className="vr-muted">Nenhum produto estudado cabe nesses filtros.</p>
          )}
          {result.excluded.length > 0 && (
            <details>
              <summary>Fora dos filtros ({result.excluded.length})</summary>
              <ul>
                {result.excluded.map((item) => (
                  <li key={item.title}>
                    {item.title}: {item.reasons.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
