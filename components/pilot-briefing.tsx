"use client";

import { useEffect, useState } from "react";
import type { PilotAction } from "@/lib/pilot/briefing";

type Briefing = {
  generatedAt: string;
  actions: PilotAction[];
  totalStake: number;
  assumptions: string[];
  error?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const KIND: Record<PilotAction["kind"], { label: string; tone: string }> = {
  LOSS: { label: "Prejuízo", tone: "risk" },
  RESTOCK: { label: "Reposição", tone: "info" },
  BELOW_FLOOR: { label: "Margem baixa", tone: "warn" },
  ADD_COST: { label: "Custo faltando", tone: "warn" },
  QUESTION: { label: "Pergunta", tone: "info" },
  IDLE_STOCK: { label: "Estoque parado", tone: "muted" },
};

export function PilotBriefing() {
  const [data, setData] = useState<Briefing | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/pilot/briefing", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Briefing;
        if (!r.ok || !Array.isArray(body.actions)) throw new Error(body.error || "Não foi possível montar o briefing.");
        return { ...body, assumptions: Array.isArray(body.assumptions) ? body.assumptions : [] };
      })
      .then((body) => { if (active) setData(body); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Falha no briefing."); });
    return () => { active = false; };
  }, []);

  if (error) return null; // sem conta conectada o Início já mostra o passo a passo
  if (!data)
    return (
      <section className="clean-panel pilot" aria-busy="true">
        <p className="page-kicker">Piloto · hoje</p>
        <h2>Lendo seus pedidos, estoque e perguntas…</h2>
      </section>
    );

  const visible = showAll ? data.actions : data.actions.slice(0, 5);
  return (
    <section className="clean-panel pilot" aria-labelledby="pilot-title">
      <header className="pilot-head">
        <div>
          <p className="page-kicker">Piloto · hoje</p>
          <h2 id="pilot-title">
            {data.actions.length
              ? `${data.actions.length} ${data.actions.length === 1 ? "ação" : "ações"} para hoje`
              : "Nada urgente hoje"}
          </h2>
          <p>
            {data.actions.length
              ? "Em ordem de dinheiro em jogo, calculado com a tarifa e o frete que o Mercado Livre cobrou nos seus pedidos."
              : "Estoque, margem e perguntas estão em dia. O Piloto confere de novo a cada visita."}
          </p>
        </div>
      </header>

      {!!data.actions.length && (
        <ol className="pilot-list">
          {visible.map((action) => (
            <li key={action.id} className={`pilot-item pilot-item--${KIND[action.kind].tone}`}>
              <div className="pilot-item-main">
                <span className={`pilot-kind pilot-kind--${KIND[action.kind].tone}`}>{KIND[action.kind].label}</span>
                <strong className="pilot-product" title={action.title}>{action.title}</strong>
                <p className="pilot-headline">{action.headline}</p>
                <p className="pilot-detail">{action.detail}</p>
                {action.formula && (
                  <details className="pilot-formula">
                    <summary>Ver a conta</summary>
                    <p>{action.formula}</p>
                  </details>
                )}
                {done[action.id] ? (
                  <p className="pilot-done" role="status">{done[action.id]}</p>
                ) : action.execute ? (
                  <PilotExecute
                    action={action}
                    onDone={(message) => setDone((d) => ({ ...d, [action.id]: message }))}
                  />
                ) : null}
              </div>
              <div className="pilot-item-side">
                <span className="pilot-stake">{action.stakeLabel}</span>
                <a
                  className="vr-btn vr-btn--small"
                  href={action.cta.href}
                  {...(action.cta.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {action.cta.label}
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}

      {data.actions.length > 5 && (
        <button type="button" className="secondary pilot-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Mostrar só as 5 principais" : `Ver todas as ${data.actions.length} ações`}
        </button>
      )}

      {!!data.assumptions.length && (
        <ul className="pilot-notes">
          {data.assumptions.map((text) => <li key={text}>{text}</li>)}
        </ul>
      )}
      <p className="pilot-foot">O Piloto só muda algo na sua conta depois do seu clique em confirmar. Tudo fica registrado.</p>
    </section>
  );
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

function PilotExecute({ action, onDone }: { action: PilotAction; onDone: (message: string) => void }) {
  const exec = action.execute!;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [price, setPrice] = useState(exec.type === "PRICE" ? exec.suggested.toFixed(2).replace(".", ",") : "");

  if (!open)
    return (
      <button type="button" className="vr-btn vr-btn--small pilot-exec-open" onClick={() => setOpen(true)}>
        {exec.type === "ANSWER" ? "Responder aqui" : `Ajustar preço para ${money.format(exec.suggested)}`}
      </button>
    );

  async function draft() {
    if (exec.type !== "ANSWER") return;
    setBusy(true); setError("");
    try {
      const r = await post<{ draft: string; problems: string[] }>(`/api/pilot/questions/${exec.questionId}/draft`, {});
      setText(r.draft);
      if (r.problems.length) setError(r.problems.join(" "));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no rascunho."); }
    finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setError("");
    try {
      if (exec.type === "ANSWER") {
        await post(`/api/pilot/questions/${exec.questionId}/answer`, { text, confirm: true });
        onDone("Resposta publicada no Mercado Livre.");
      } else {
        const value = Number(price.replace(/\./g, "").replace(",", "."));
        const r = await post<{ before: number; after: number }>("/api/pilot/price", {
          mlItemId: action.mlItemId, price: value, expectedCurrent: exec.current, confirm: true,
        });
        onDone(`Preço alterado de ${money.format(r.before)} para ${money.format(r.after)} no Mercado Livre.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      setConfirming(false);
    } finally { setBusy(false); }
  }

  const priceValue = Number(price.replace(/\./g, "").replace(",", "."));
  return (
    <div className="pilot-exec">
      {exec.type === "ANSWER" ? (
        <>
          <label className="pilot-exec-label" htmlFor={`answer-${exec.questionId}`}>Sua resposta</label>
          <textarea
            id={`answer-${exec.questionId}`}
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => { setText(e.target.value); setConfirming(false); }}
            placeholder="Escreva ou gere um rascunho com a IA"
          />
          <div className="pilot-exec-row">
            <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={busy} onClick={() => void draft()}>
              {busy && !confirming ? "Gerando..." : "Rascunho com IA"}
            </button>
            {!confirming ? (
              <button type="button" className="vr-btn vr-btn--small" disabled={busy || text.trim().length < 2} onClick={() => setConfirming(true)}>
                Enviar resposta
              </button>
            ) : (
              <>
                <span className="pilot-exec-warn">Vai publicar no Mercado Livre. Confirma?</span>
                <button type="button" className="vr-btn vr-btn--small" disabled={busy} onClick={() => void apply()}>
                  {busy ? "Publicando..." : "Sim, publicar"}
                </button>
                <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={busy} onClick={() => setConfirming(false)}>Voltar</button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <label className="pilot-exec-label" htmlFor={`price-${action.mlItemId}`}>
            Novo preço (atual {money.format(exec.current)}, piso {money.format(exec.suggested)})
          </label>
          <div className="pilot-exec-row">
            <input
              id={`price-${action.mlItemId}`}
              inputMode="decimal"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setConfirming(false); }}
            />
            {!confirming ? (
              <button type="button" className="vr-btn vr-btn--small" disabled={busy || !(priceValue > 0)} onClick={() => setConfirming(true)}>
                Aplicar
              </button>
            ) : (
              <>
                <span className="pilot-exec-warn">
                  Mudar de {money.format(exec.current)} para {money.format(priceValue)} no Mercado Livre?
                </span>
                <button type="button" className="vr-btn vr-btn--small" disabled={busy} onClick={() => void apply()}>
                  {busy ? "Aplicando..." : "Sim, mudar preço"}
                </button>
                <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={busy} onClick={() => setConfirming(false)}>Voltar</button>
              </>
            )}
          </div>
        </>
      )}
      {error && <p className="pilot-exec-error" role="alert">{error}</p>}
    </div>
  );
}
