"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconName =
  | "dashboard"
  | "products"
  | "sales"
  | "analysis"
  | "radar"
  | "extension"
  | "integrations";

type MenuItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
};

const groups: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/produtos", label: "Produtos", icon: "products" },
      { href: "/vendas", label: "Vendas & lucro", icon: "sales" },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { href: "/analisar", label: "Análise de produtos", icon: "analysis" },
      { href: "/oportunidades", label: "Radar de oportunidades", icon: "radar" },
      { href: "/extensao", label: "Extensão Radar", icon: "extension", badge: "BETA" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/integracoes", label: "Integrações", icon: "integrations" },
    ],
  },
];

function MenuIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    );
  }

  if (name === "products") {
    return (
      <svg {...common}>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    );
  }

  if (name === "sales") {
    return (
      <svg {...common}>
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
        <path d="M3 19h18" />
      </svg>
    );
  }

  if (name === "analysis") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4M8.5 11h5M11 8.5v5" />
      </svg>
    );
  }

  if (name === "radar") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 12 18 6M12 4v2M4 12h2" />
      </svg>
    );
  }

  if (name === "extension") {
    return (
      <svg {...common}>
        <path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z" />
        <path d="M10 11h4M12 9v4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="m8 7 3 8m5-8-3 8M8 6h8" />
    </svg>
  );
}

export function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("radar.sidebar.collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("radar.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

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

      <aside
        className={[
          "sidebar",
          open ? "mobile-open" : "",
          collapsed ? "is-collapsed" : "",
        ].join(" ")}
      >
        <div className="sidebar-brand-row">
          <Link className="brand brand-link" href="/" onClick={() => setOpen(false)}>
            <span className="brand-mark">
              <span>R</span>
            </span>
            <div className="brand-copy">
              <strong>mercado radar</strong>
              <small>seller intelligence</small>
            </div>
          </Link>

          <button
            type="button"
            className="sidebar-collapse-icon"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={toggleCollapsed}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              <div className="nav-group-items">
                {group.items.map((item) => (
                  <Link
                    className={"nav-item " + (isActive(item.href) ? "active" : "")}
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="nav-item-icon">
                      <MenuIcon name={item.icon} />
                    </span>
                    <span className="nav-item-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-account">
          <span className="sidebar-account-avatar">V</span>
          <div className="sidebar-account-copy">
            <strong>Vidalys</strong>
            <small>Mercado Livre conectado</small>
          </div>
          <span className="sidebar-account-status" title="Online" />
        </div>

        <button
          type="button"
          className="sidebar-collapse"
          onClick={toggleCollapsed}
        >
          <span>{collapsed ? "›" : "‹"}</span>
          <strong>{collapsed ? "Expandir" : "Recolher sidebar"}</strong>
        </button>
      </aside>
    </>
  );
}
