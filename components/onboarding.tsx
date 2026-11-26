"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Steps = { connected: boolean; extension: boolean; synced: boolean; cost: boolean };

const STEPS: Array<{
  key: keyof Steps;
  title: string;
  hint: string;
  action: { label: string; href: string; external?: boolean };
}> = [
  {
    key: "connected",
    title: "Conectar sua conta do Mercado Livre",
    hint: "Autoriza o Radar a ler anúncios, pedidos e métricas da sua conta.",
    action: { label: "Conectar", href: "/api/integrations/mercadolivre/authorize", external: true },
  },
  {
    key: "extension",
    title: "Instalar a extensão e entrar nela",
    hint: "Leva score, demanda e margem para dentro das buscas e anúncios.",
    action: { label: "Instalar extensão", href: "/extensao" },
  },
  {
    key: "synced",
    title: "Sincronizar seus anúncios",
    hint: "Traz seus anúncios para o Radar poder cruzar preço, estoque e vendas.",
    action: { label: "Abrir produtos", href: "/produtos" },
  },
  {
    key: "cost",
    title: "Cadastrar o custo de pelo menos um produto",
    hint: "Sem custo não existe margem real: é o que liga o Radar ao seu lucro.",
    action: { label: "Cadastrar custo", href: "/produtos" },
  },
];

export function Onboarding() {
  const [steps, setSteps] = useState<Steps | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/onboarding", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Falha ao carregar.");
      setSteps(body.steps as Steps);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const done = steps ? STEPS.filter((step) => steps[step.key]).length : 0;
  const percent = Math.round((done / STEPS.length) * 100);

  return (
    <section className="rd-onb">
      <header className="rd-onb__head">
        <h1>Primeiros passos</h1>
        <p>Quatro passos para o Radar começar a mostrar o lucro real de cada produto.</p>
      </header>

      {error ? (
        <div className="rd-onb__error" role="alert" style={{ marginTop: 24 }}>
          {error}{" "}
          <button className="rd-btn rd-btn--ghost" type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <div className="rd-onb__bar" aria-live="polite">
            <div className="rd-onb__track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="rd-onb__fill" style={{ width: percent + "%" }} />
            </div>
            <span className="rd-onb__count">{steps ? `${done}/${STEPS.length}` : "…"}</span>
          </div>

          <div className="rd-onb__list">
            {STEPS.map((step, index) => {
              const finished = Boolean(steps?.[step.key]);
              return (
                <div className={"rd-step" + (finished ? " rd-step--done" : "")} key={step.key}>
                  <span className="rd-step__icon" aria-hidden="true">{finished ? "✓" : index + 1}</span>
                  <div className="rd-step__copy">
                    <strong>{step.title}</strong>
                    <span>{step.hint}</span>
                  </div>
                  {finished ? (
                    <span className="rd-badge rd-badge--ok">Concluído</span>
                  ) : steps && step.action.external ? (
                    <a className="rd-btn" href={step.action.href}>{step.action.label}</a>
                  ) : steps ? (
                    <Link className="rd-btn" href={step.action.href}>{step.action.label}</Link>
                  ) : null}
                </div>
              );
            })}
          </div>

          {steps && done === STEPS.length && (
            <div className="rd-onb__done">
              <strong>Tudo pronto.</strong>
              <p>Seu Radar já tem conta, extensão, anúncios e custo. Hora de achar oportunidades.</p>
              <Link className="rd-btn" href="/oportunidades">Abrir radar de oportunidades</Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
