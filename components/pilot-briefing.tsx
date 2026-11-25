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

  useEffect(() => {
    let active = true;
    fetch("/api/pilot/briefing", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Briefing;
        if (!r.ok) throw new Error(body.error || "Não foi possível montar o briefing.");
        return body;
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
      <p className="pilot-foot">Só leitura: o Piloto ainda não altera nada na sua conta.</p>
    </section>
  );
}
