"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const items = [
  ["/analisar", "Analisar oportunidade"],
  ["/oportunidades", "Radar de oportunidades"],
  ["/produtos", "Capital & estoque"],
  ["/vendas", "Lucro realizado"],
  ["/integracoes", "Integrações"],
] as const;

export function AppNavigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        <Link className="brand brand-link" href="/" onClick={() => setOpen(false)}>
          <span className="brand-mark">MR</span>
          <div>
            <strong>Mercado Radar</strong>
            <small>Revenda Intelligence</small>
          </div>
        </Link>

        <nav>
          {items.map(([href, label]) => (
            <Link
              className={"nav-item " + (pathname === href ? "active" : "")}
              href={href}
              key={href}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
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
