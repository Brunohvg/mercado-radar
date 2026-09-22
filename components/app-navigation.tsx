"use client";

import { useState } from "react";

const items = [
  ["#analisar", "Analisar oportunidade"],
  ["#oportunidades", "Radar de oportunidades"],
  ["#produtos", "Capital & estoque"],
  ["#vendas", "Lucro realizado"],
  ["#kits", "Estratégias de kit"],
  ["#integracoes", "Integrações"],
] as const;

export function AppNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mobile-nav-button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="mobile-nav-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={"sidebar " + (open ? "mobile-open" : "")}>
        <div className="brand">
          <span className="brand-mark">MR</span>
          <div>
            <strong>Mercado Radar</strong>
            <small>Revenda Intelligence</small>
          </div>
        </div>

        <nav>
          {items.map(([href, label], index) => (
            <a
              className={"nav-item " + (index === 0 ? "active" : "")}
              href={href}
              key={href}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" />
          Core nativo · PostgreSQL
        </div>
      </aside>
    </>
  );
}
