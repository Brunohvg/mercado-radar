"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingInsightPanel, type EditableListing, type InsightData } from "@/components/listing-insight-panel";
import type { MissingAttribute, OfficialQuality, PriceSuggestion, QualityCheck } from "@/lib/listing-quality";

type Pick = { mlItemId: string; title: string; thumbnail: string | null; currentPrice: number | null; status: string };
type Quality = {
  item: {
    mlItemId: string;
    title: string;
    price: number;
    availableQuantity: number;
    status: string;
    permalink: string | null;
    thumbnail: string | null;
    pictures: number;
    description: string | null;
    descriptionReadable: boolean;
    categoryName: string | null;
  };
  diagnosis: { score: number; checks: QualityCheck[]; missingAttributes: MissingAttribute[]; titleMax: number; competitorTerms: string[] };
  comparison: { date: string; source: string | null; items: Array<{ id: string; title: string; permalink: string | null; observedAt: string }> };
  performance: { days: number; unitsSold: number | null; visits: number | null; conversionPercent: number | null };
  official: OfficialQuality | null;
  priceSuggestion: PriceSuggestion | null;
  ai: { configured: boolean; message: string };
  error?: string;
};
type Suggestion = { title: string | null; description: string; notes: string[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const ICON = { ok: "✓", warn: "!", bad: "✕" } as const;

export function ListingImprover() {
  const [products, setProducts] = useState<Pick[] | null>(null);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Quality | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("item") ?? "";
    fetch("/api/ml/listing-quality", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível listar seus anúncios.");
        setProducts(body.products);
        const first = initial || body.products[0]?.mlItemId || "";
        setSelected(first);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar."));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const r = await fetch("/api/ml/listing-quality?id=" + encodeURIComponent(id), { cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as Quality;
      if (!r.ok) throw new Error(body.error ?? "Não foi possível ler o anúncio.");
      setData(body);
      window.history.replaceState(null, "", "?item=" + id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler o anúncio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(selected); }, [selected, load]);

  return (
    <section className="improve-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Vender</p>
          <h1>Melhorar anúncio</h1>
          <p>Confira a ficha, as visitas e os títulos de anúncios similares. Nada muda no Mercado Livre sem o seu clique.</p>
        </div>
      </header>

      {products && (
        <label className="improve-picker">
          <span>Anúncio</span>
          <select className="clean-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {products.map((p) => (
              <option key={p.mlItemId} value={p.mlItemId}>
                {p.title}{p.status === "paused" ? " (pausado)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {products && !products.length && (
        <div className="clean-panel module-empty"><strong>Nenhum anúncio ativo</strong><span>Sincronize seus anúncios em Anúncios.</span></div>
      )}
      {error && <div className="error">{error}</div>}
      {loading && <div className="clean-loading">Lendo o anúncio, a categoria e os concorrentes no Mercado Livre...</div>}
      {data && <Improver key={data.item.mlItemId} data={data} onChanged={() => void load(data.item.mlItemId)} />}
    </section>
  );
}

function Improver({ data, onChanged }: { data: Quality; onChanged: () => void }) {
  const { item, diagnosis, performance } = data;
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const shown = data.official?.score ?? diagnosis.score;
  const tone = shown >= 80 ? "good" : shown >= 50 ? "warn" : "risk";

  async function suggest() {
    setAiBusy(true);
    setAiError("");
    try {
      const r = await fetch("/api/ml/listing-quality/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mlItemId: item.mlItemId }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível gerar sugestões.");
      setSuggestion(body);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Falha na IA.");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="improve-grid">
      <section className="clean-panel improve-summary">
        {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="clean-product-thumb">ML</span>}
        <div className="improve-summary-main">
          <strong>{item.title}</strong>
          <small>
            {money.format(item.price)} · {item.availableQuantity} em estoque{item.categoryName ? ` · ${item.categoryName}` : ""}
            {item.permalink && <> · <a href={item.permalink} target="_blank" rel="noreferrer">ver no ML</a></>}
          </small>
          <dl className="improve-perf">
            <div><dt>Vendas em {performance.days} dias</dt><dd>{performance.unitsSold ?? "—"}</dd></div>
            <div><dt>Visitas</dt><dd>{performance.visits?.toLocaleString("pt-BR") ?? "—"}</dd></div>
            <div><dt>Conversão</dt><dd>{performance.conversionPercent == null ? "—" : `${performance.conversionPercent.toLocaleString("pt-BR")}%`}</dd></div>
          </dl>
        </div>
        <div className="improve-score-wrap">
          <div className={`improve-score tone-${tone}`}>
            <strong>{shown}</strong>
            <span>de 100</span>
          </div>
          <small>{data.official ? `Nota do Mercado Livre${data.official.level ? ` · ${data.official.level}` : ""}` : "Nota do Radar"}</small>
        </div>
      </section>

      {data.official && data.official.pending.length > 0 && (
        <section className="clean-panel improve-checks">
          <header>
            <div>
              <strong>O que o Mercado Livre pede</strong>
              <small>Itens pendentes na nota oficial de qualidade do anúncio.</small>
            </div>
          </header>
          <ul>
            {data.official.pending.map((p) => (
              <li key={p.title + (p.detail ?? "")} className={`improve-check is-${p.warning ? "bad" : "warn"}`}>
                <span className="improve-check-icon" aria-hidden="true">{p.warning ? ICON.bad : ICON.warn}</span>
                <div>
                  <strong>{p.title}</strong>
                  {p.detail && <p>{p.detail}</p>}
                  {p.link && /^https:\/\/[\w.-]*mercadoli(?:vre|bre)\.com/.test(p.link) && <a href={p.link} target="_blank" rel="noreferrer">Resolver no Mercado Livre</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="clean-panel improve-checks">
        <header><strong>{data.official ? "O que mais o Radar viu" : "O que melhorar"}</strong></header>
        <details><summary>Referências da comparação ({data.comparison.items.length})</summary>
          <p>Mercado Livre · {data.comparison.source === "RADAR" ? "leituras salvas no Radar" : data.comparison.source === "CATALOGO" ? "catálogo" : "busca de anúncios"} · {new Date(data.comparison.date).toLocaleDateString("pt-BR")}</p>
          {data.comparison.items.length ? <ul>{data.comparison.items.map(c => <li key={c.id}>
            {c.permalink?.startsWith("https://") ? <a href={c.permalink} target="_blank" rel="noreferrer">{c.title}</a> : c.title} · {new Date(c.observedAt).toLocaleDateString("pt-BR")}
          </li>)}</ul> : <p>{!data.comparison.source || data.comparison.source === "BLOQUEADA" ? "Consulta de concorrentes indisponível." : "Nenhum título suficientemente similar na amostra."}</p>}
        </details>
        <ul>
          {[...diagnosis.checks].sort((a, b) => "bwo".indexOf(a.status[0]) - "bwo".indexOf(b.status[0])).map((c) => (
            <li key={c.id} className={`improve-check is-${c.status}`}>
              <span className="improve-check-icon" aria-hidden="true">{ICON[c.status]}</span>
              <div><strong>{c.label}</strong><p>{c.detail}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="clean-panel improve-ai">
        <header>
          <div>
            <strong>Sugestões da IA</strong>
            <small>Usa só a sua ficha técnica e a descrição atual; os títulos dos concorrentes mostram como o comprador busca.</small>
          </div>
          {data.ai.configured ? (
            <button type="button" className="vr-btn vr-btn--small" disabled={aiBusy} onClick={() => void suggest()}>
              {aiBusy ? "Gerando..." : suggestion ? "Gerar de novo" : "Gerar sugestões"}
            </button>
          ) : null}
        </header>
        {!data.ai.configured && <p className="improve-muted">{data.ai.message}</p>}
        {aiError && <p className="pilot-exec-error" role="alert">{aiError}</p>}
        {suggestion?.notes.length ? (
          <ul className="improve-notes">{suggestion.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        ) : null}
        <TitleEditor item={item} suggested={suggestion?.title ?? null} max={diagnosis.titleMax} terms={diagnosis.competitorTerms} onDone={onChanged} />
        <DescriptionEditor item={item} suggested={suggestion?.description ?? null} />
      </section>

      {!!diagnosis.missingAttributes.length && (
        <AttributesEditor item={item} missing={diagnosis.missingAttributes} onDone={onChanged} />
      )}

      <PriceSection item={item} suggestion={data.priceSuggestion} />
    </div>
  );
}

function useApply() {
  const [state, setState] = useState<{ confirming: boolean; busy: boolean; error: string; done: string }>({ confirming: false, busy: false, error: "", done: "" });
  async function send(payload: Record<string, unknown>, doneMsg: string) {
    setState((s) => ({ ...s, busy: true, error: "" }));
    try {
      const r = await fetch("/api/ml/listing-quality/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, confirm: true }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "O Mercado Livre recusou a alteração.");
      setState({ confirming: false, busy: false, error: "", done: doneMsg });
      return true;
    } catch (e) {
      setState({ confirming: false, busy: false, error: e instanceof Error ? e.message : "Falha ao aplicar.", done: "" });
      return false;
    }
  }
  return { state, setState, send };
}

function ApplyButtons({ label, disabled, apply, onConfirm }: { label: string; disabled: boolean; apply: ReturnType<typeof useApply>; onConfirm: () => void }) {
  const { state, setState } = apply;
  if (state.done) return <p className="pilot-done" role="status">{state.done}</p>;
  return (
    <div className="improve-apply">
      {!state.confirming ? (
        <button type="button" className="vr-btn vr-btn--small" disabled={disabled} onClick={() => setState((s) => ({ ...s, confirming: true }))}>{label}</button>
      ) : (
        <>
          <span>Enviar ao Mercado Livre?</span>
          <button type="button" className="vr-btn vr-btn--small" disabled={state.busy} onClick={onConfirm}>{state.busy ? "Enviando..." : "Sim, aplicar"}</button>
          <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={state.busy} onClick={() => setState((s) => ({ ...s, confirming: false }))}>Voltar</button>
        </>
      )}
      {state.error && <p className="pilot-exec-error" role="alert">{state.error}</p>}
    </div>
  );
}

function TitleEditor({ item, suggested, max, terms, onDone }: { item: Quality["item"]; suggested: string | null; max: number; terms: string[]; onDone: () => void }) {
  const [value, setValue] = useState(item.title);
  const apply = useApply();
  useEffect(() => { if (suggested) setValue(suggested); }, [suggested]);
  const len = value.trim().length;
  return (
    <div className="improve-field">
      <div className="improve-field-head">
        <strong>Título</strong>
        <small className={len > max ? "danger-value" : ""}>{len}/{max}</small>
      </div>
      <p className="improve-current">Atual: {item.title}</p>
      <input className="improve-input" value={value} maxLength={max + 20} onChange={(e) => setValue(e.target.value)} aria-label="Novo título" />
      {terms.length > 0 && <small className="improve-muted">Os concorrentes usam: {terms.join(", ")}. Use só o que vale para o seu produto.</small>}
      <ApplyButtons
        label="Aplicar título"
        apply={apply}
        disabled={len < 10 || len > max || value.trim() === item.title}
        onConfirm={() => void apply.send({ field: "title", mlItemId: item.mlItemId, title: value.trim(), expectedTitle: item.title }, "Título alterado no Mercado Livre.").then((ok) => ok && setTimeout(onDone, 1200))}
      />
    </div>
  );
}

function DescriptionEditor({ item, suggested }: { item: Quality["item"]; suggested: string | null }) {
  const [value, setValue] = useState(item.description ?? "");
  const apply = useApply();
  useEffect(() => { if (suggested) setValue(suggested); }, [suggested]);
  return (
    <div className="improve-field">
      <div className="improve-field-head">
        <strong>Descrição</strong>
        <small>{value.trim().length} caracteres</small>
      </div>
      {!item.descriptionReadable && <p className="improve-muted">Não conseguimos ler a descrição atual pela API.</p>}
      <textarea className="improve-input" rows={8} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Descrição" />
      <ApplyButtons
        label="Aplicar descrição"
        apply={apply}
        disabled={value.trim().length < 20 || value.trim() === (item.description ?? "").trim()}
        onConfirm={() => void apply.send({ field: "description", mlItemId: item.mlItemId, description: value.trim() }, "Descrição alterada no Mercado Livre.")}
      />
    </div>
  );
}

function AttributesEditor({ item, missing, onDone }: { item: Quality["item"]; missing: MissingAttribute[]; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, { valueId?: string; valueName: string }>>({});
  const apply = useApply();
  const filled = Object.entries(values).filter(([, v]) => v.valueName.trim());
  return (
    <section className="clean-panel improve-attrs">
      <header>
        <strong>Ficha técnica que falta</strong>
        <small>Cada campo preenchido vira filtro de busca no Mercado Livre. Preencha só o que você tem certeza.</small>
      </header>
      <div className="improve-attr-grid">
        {missing.map((a) => (
          <label key={a.id} className="improve-attr">
            <span>{a.name}{a.required && <b> obrigatório</b>}</span>
            {a.values.length ? (
              <select
                className="clean-select"
                value={values[a.id]?.valueId ?? ""}
                onChange={(e) => {
                  const v = a.values.find((x) => x.id === e.target.value);
                  setValues((s) => ({ ...s, [a.id]: v ? { valueId: v.id, valueName: v.name } : { valueName: "" } }));
                }}
              >
                <option value="">—</option>
                {a.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            ) : (
              <input
                className="improve-input"
                placeholder={a.hint ?? ""}
                value={values[a.id]?.valueName ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [a.id]: { valueName: e.target.value } }))}
              />
            )}
          </label>
        ))}
      </div>
      <ApplyButtons
        label={`Salvar ${filled.length || ""} campo(s) no ML`}
        apply={apply}
        disabled={!filled.length}
        onConfirm={() =>
          void apply
            .send({ field: "attributes", mlItemId: item.mlItemId, attributes: filled.map(([id, v]) => ({ id, ...v, valueName: v.valueName.trim() })) }, "Ficha técnica atualizada no Mercado Livre.")
            .then((ok) => ok && setTimeout(onDone, 1200))
        }
      />
    </section>
  );
}

function PriceSection({ item, suggestion }: { item: Quality["item"]; suggestion: PriceSuggestion | null }) {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [error, setError] = useState("");
  const [listing, setListing] = useState<EditableListing>({ mlItemId: item.mlItemId, currentPrice: item.price, availableQuantity: item.availableQuantity, status: item.status, permalink: item.permalink });
  useEffect(() => {
    fetch("/api/ml/listing-insights?id=" + encodeURIComponent(item.mlItemId), { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível comparar o preço.");
        setInsight(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao comparar preço."));
  }, [item.mlItemId]);
  return (
    <section className="clean-panel improve-price">
      <header>
        <strong>Preço pelos concorrentes</strong>
        <small>Mediana e faixa das ofertas, seu piso de margem e, no catálogo, o preço que ganha a vitrine.</small>
      </header>
      {suggestion && (
        <p className="improve-ml-price">
          Sugestão de preço do Mercado Livre: <b>{money.format(suggestion.suggested)}</b>
          {suggestion.lowest != null && <> · menor preço entre os concorrentes {money.format(suggestion.lowest)}</>}
          . Confira se ele cabe no seu piso de margem abaixo antes de usar.
        </p>
      )}
      {error && <p className="improve-muted">{error}</p>}
      {!insight && !error && <p className="improve-muted">Comparando com os concorrentes...</p>}
      {insight && <ListingInsightPanel item={listing} insight={insight} onEdited={(patch) => setListing((l) => ({ ...l, ...patch }))} />}
    </section>
  );
}
