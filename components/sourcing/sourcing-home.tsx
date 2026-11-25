"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, brl, dateBr, parseNumber, pct, STATUS_LABEL } from "./format";

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

const JOURNEY = [
  ["Encontre", "o produto"],
  ["Localize", "fornecedores"],
  ["Qualifique", "quem vende"],
  ["Descubra", "sua margem"],
  ["Planeje", "o investimento"],
  ["Comece", "a vender"],
];

export function SourcingHome() {
  const router = useRouter();
  const [rows, setRows] = useState<OpportunityRow[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ opportunities: OpportunityRow[] }>("/api/sourcing/opportunities")
      .then((body) => setRows(body.opportunities))
      .catch((caught: Error) => setError(caught.message));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const link = String(form.get("link") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const mlb = link.match(/MLB-?(\d{5,15})/i);
    setCreating(true);
    setError("");
    try {
      const body = await api<{ opportunity: { id: string } }>("/api/sourcing/opportunities", {
        method: "POST",
        body: JSON.stringify({
          title: title || (mlb ? `Anúncio MLB${mlb[1]}` : ""),
          mlItemId: mlb ? `MLB${mlb[1]}` : null,
          permalink: /^https?:\/\//.test(link) ? link : null,
          referencePrice: parseNumber(String(form.get("price") ?? "")),
          referenceSource: parseNumber(String(form.get("price") ?? "")) != null ? "MANUAL" : null,
        }),
      });
      router.push(`/onde-comprar/${body.opportunity.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar.");
      setCreating(false);
    }
  }

  return (
    <div className="vr">
      <header className="vr-hero">
        <p className="vr-kicker">Vidalys Radar · Inteligência para revender</p>
        <h1>Encontre o produto, encontre o fornecedor, descubra sua margem.</h1>
        <ol className="vr-journey" aria-label="Jornada">
          {JOURNEY.map(([verb, rest], index) => (
            <li key={verb}>
              <span className="vr-journey-n">{index + 1}</span>
              <strong>{verb}</strong> {rest}
            </li>
          ))}
        </ol>
      </header>

      <div className="vr-grid-2">
        <section className="vr-card" aria-labelledby="vr-new">
          <h2 id="vr-new">Estudar um produto</h2>
          <p className="vr-muted">
            Cole o link do anúncio do Mercado Livre ou digite o nome. Na extensão, use o botão “Onde comprar” na página do produto.
          </p>
          <form className="vr-form" onSubmit={create}>
            <label>
              Link do anúncio
              <input name="link" placeholder="https://produto.mercadolivre.com.br/MLB-..." inputMode="url" />
            </label>
            <label>
              Nome do produto
              <input name="title" placeholder="Ex.: Ilhós nº 54 Baxmann 1000 un." />
            </label>
            <label>
              Preço de venda no mercado (opcional)
              <input name="price" placeholder="R$ 42,90" inputMode="decimal" />
            </label>
            <button className="vr-btn" disabled={creating}>
              {creating ? "Criando…" : "Começar estudo"}
            </button>
          </form>
        </section>
        <CapitalRadar />
      </div>

      {error && <p className="vr-alert" role="alert">{error}</p>}

      <section className="vr-card" aria-labelledby="vr-list">
        <h2 id="vr-list">Produtos em estudo</h2>
        {!rows && !error && <p className="vr-muted">Carregando…</p>}
        {rows && !rows.length && (
          <p className="vr-muted">Nenhum produto ainda. Comece por um anúncio que você já vende ou quer vender.</p>
        )}
        {rows && rows.length > 0 && (
          <ul className="vr-list">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/onde-comprar/${row.id}`}>
                  <span className="vr-list-title">{row.title}</span>
                  <span className="vr-list-meta">
                    <span className={`vr-status vr-status--${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
                    {row.supplierCount} fornecedor(es) · {row.quoteCount} cotação(ões) · venda {brl(row.referencePrice)} · {dateBr(row.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
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
    <section className="vr-card vr-card--accent" aria-labelledby="vr-capital">
      <h2 id="vr-capital">Encontre minha oportunidade</h2>
      <p className="vr-muted">Diga quanto tem para investir. O Radar mostra quais produtos estudados cabem nesse valor.</p>
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
                Lote mínimo {brl(match.viability.order.capital)} · margem {pct(match.viability.perSale?.marginPercent)}
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
