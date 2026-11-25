"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = {
  steps: { connected: boolean; extension: boolean; synced: boolean; cost: boolean; tax: boolean; sales: boolean; allCosts: boolean; supplier: boolean };
  counts: { products: number; withCost: number; suppliers: number };
};

const HIDE_KEY = "radar.setup.hidden";

/** O que falta para o Radar dar números certos, em ordem, com um clique para cada passo. */
export function SetupChecklist() {
  const [status, setStatus] = useState<Status | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(window.localStorage.getItem(HIDE_KEY) === "1"); } catch { /* sem armazenamento */ }
    fetch("/api/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body?.steps && setStatus(body))
      .catch(() => null);
  }, []);

  if (!status) return null;
  const { steps, counts } = status;
  const items = [
    { done: steps.connected, title: "Conectar sua conta do Mercado Livre", why: "Sem ela o Radar não lê anúncios, vendas nem tarifas.", href: "/integracoes", cta: "Conectar" },
    { done: steps.synced, title: "Trazer seus anúncios", why: "Lista seus produtos com preço e estoque.", href: "/anuncios", cta: "Abrir anúncios" },
    { done: steps.sales, title: "Trazer suas vendas", why: "Com as vendas o Radar calcula lucro, giro e reposição.", href: "/vendas", cta: "Sincronizar vendas" },
    { done: steps.tax, title: "Informar seu imposto", why: "Sem o imposto o lucro aparece maior do que é.", href: "/configuracoes", cta: "Informar" },
    {
      done: steps.allCosts,
      title: counts.products ? `Informar o custo dos produtos (${counts.withCost} de ${counts.products})` : "Informar o custo dos produtos",
      why: "O custo é o que transforma faturamento em lucro.",
      href: "/vendas?filtro=sem-custo",
      cta: "Informar custos",
    },
    { done: steps.supplier, title: "Cadastrar um fornecedor", why: "Libera o pedido de compra pronto para mandar.", href: "/fornecedores", cta: "Cadastrar" },
    { done: steps.extension, title: "Instalar a extensão (opcional)", why: "Mostra lucro e concorrentes dentro do Mercado Livre.", href: "/extensao", cta: "Instalar" },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const next = items.find((i) => !i.done)!;

  if (hidden)
    return (
      <button type="button" className="setup-reopen" onClick={() => { setHidden(false); try { window.localStorage.removeItem(HIDE_KEY); } catch { /* */ } }}>
        Configuração: {done} de {items.length} passos · ver o que falta
      </button>
    );

  return (
    <section className="clean-panel setup-card" aria-labelledby="setup-title">
      <header>
        <div>
          <strong id="setup-title">Deixe o Radar pronto · {done} de {items.length}</strong>
          <small>Cada passo deixa os números mais certos. Comece por: {next.title.toLowerCase()}.</small>
        </div>
        <button type="button" className="setup-hide" onClick={() => { setHidden(true); try { window.localStorage.setItem(HIDE_KEY, "1"); } catch { /* */ } }}>
          Esconder
        </button>
      </header>
      <div className="setup-bar" aria-hidden="true"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <ol className="setup-list">
        {items.map((item) => (
          <li key={item.title} className={item.done ? "is-done" : item === next ? "is-next" : ""}>
            <span className="setup-mark" aria-hidden="true">{item.done ? "✓" : ""}</span>
            <div>
              <strong>{item.title}</strong>
              {!item.done && <small>{item.why}</small>}
            </div>
            {!item.done && (
              <Link className={`vr-btn vr-btn--small${item === next ? "" : " vr-btn--ghost"}`} href={item.href}>{item.cta}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
