"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ResponsiveTables } from "@/components/responsive-tables";
import { ProductSearch } from "@/components/product-search";

type IconName =
  | "dashboard"
  | "listings"
  | "products"
  | "suppliers"
  | "ads"
  | "sales"
  | "analysis"
  | "history"
  | "ean"
  | "radar"
  | "extension"
  | "monitoring"
  | "integrations"
  | "market"
  | "steps";

type MenuItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  /** Outras rotas que acendem este item. */
  also?: string[];
};

// Menu por tarefa: vender, comprar e acompanhar o mercado. Cada item abre uma
// tela com abas para as telas irmãs; nenhuma rota foi removida.
type MenuGroup = { label: string | null; items: MenuItem[] };
const menuGroups: MenuGroup[] = [
  { label: null, items: [
    { href: "/", label: "Início", icon: "dashboard" },
    { href: "/mercado", label: "Explorar mercado", icon: "market", also: ["/monitoramento", "/oportunidades"] },
    { href: "/onde-comprar", label: "Onde comprar", icon: "suppliers" },
    { href: "/analisar", label: "Rentabilidade", icon: "analysis" },
  ] },
  { label: "Minha operação", items: [
    { href: "/anuncios", label: "Anúncios", icon: "listings", also: ["/melhorar-anuncio", "/promocoes", "/publicidade"] },
    { href: "/vendas", label: "Vendas", icon: "sales" },
    { href: "/reposicao", label: "Estoque e compras", icon: "products", also: ["/produtos", "/fornecedores"] },
  ] },
  { label: null, items: [{ href: "/configuracoes", label: "Configurações", icon: "integrations", also: ["/integracoes", "/extensao"] }] },
];
const mainItems: MenuItem[] = menuGroups.flatMap((g) => g.items);
const moreItems: MenuItem[] = [
  { href: "/assistente-anuncios", label: "Criar anúncio", icon: "listings" },
  { href: "/ean", label: "EAN em lote", icon: "ean" },
  { href: "/historico", label: "Histórico de análises", icon: "history" },
  { href: "/onboarding", label: "Primeiros passos", icon: "steps" },
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

  if (name === "listings") {
    return (
      <svg {...common}>
        <path d="M4 5.5h16v13H4z" />
        <path d="M8 9h8M8 13h5" />
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

  if (name === "suppliers") {
    return (
      <svg {...common}>
        <path d="M3 20h18M5 20V9h6v11M13 20V4h6v16" />
        <path d="M7.5 12h1M7.5 15h1M15.5 8h1M15.5 11h1M15.5 14h1" />
      </svg>
    );
  }

  if (name === "ads") {
    return (
      <svg {...common}>
        <path d="m4 13 11-5v8L4 11z" />
        <path d="M15 10h3l2 2-2 2h-3M6 13l1.5 6h3L9 12" />
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

  if (name === "history") {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5M8 17h3" />
      </svg>
    );
  }

  if (name === "ean") {
    return (
      <svg {...common}>
        <path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14" />
        <path d="M3 3h18M3 21h18" />
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

  if (name === "monitoring") {
    return (
      <svg {...common}>
        <path d="M4 15a8 8 0 1 1 16 0" />
        <path d="M12 15 17 8M7 19h10" />
        <circle cx="12" cy="15" r="1.2" />
      </svg>
    );
  }

  if (name === "market") {
    return (
      <svg {...common}>
        <path d="M3 17.5 8.5 12l3.5 3.5L20.5 7" />
        <path d="M15 7h5.5v5.5" />
        <path d="M3 21h18" />
      </svg>
    );
  }

  if (name === "steps") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [intelligenceEnabled, setIntelligenceEnabled] = useState(false);
  const [account, setAccount] = useState<{
    loaded: boolean;
    connected: boolean;
    nickname: string | null;
  }>({ loaded: false, connected: false, nickname: null });

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("radar.sidebar.collapsed") === "1");
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/integrations/mercadolivre/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (!active) return;
        setIntelligenceEnabled(body.intelligenceEnabled === true);
        setAccount({
          loaded: true,
          connected: Boolean(body?.connected),
          nickname: typeof body?.nickname === "string" ? body.nickname : null,
        });
      })
      .catch(() => {
        if (active) setAccount({ loaded: true, connected: false, nickname: null });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const inMore = moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      || pathname.startsWith("/concorrentes") || pathname.startsWith("/kits");
    if (inMore && !mainItems.some((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/")))) setMoreOpen(true);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", close); };
  }, [open]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

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

  function isMainActive(item: MenuItem) {
    return isActive(item.href) || (item.also ?? []).some(isActive);
  }

  function renderItem(item: MenuItem, active: boolean) {
    return (
      <Link
        className={"nav-item " + (active ? "active" : "")}
        href={item.href}
        key={item.href}
        onClick={() => setOpen(false)}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
      >
        <span className="nav-item-icon">
          <MenuIcon name={item.icon} />
        </span>
        <span className="nav-item-label">{item.label}</span>
        {item.badge && <span className="nav-badge">{item.badge}</span>}
      </Link>
    );
  }

  return (
    <>
      <ResponsiveTables />
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-nav-button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="radar-sidebar"
          onClick={() => setOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="mobile-topbar-brand" href="/">
          <img src="/brand/mark.svg" alt="" aria-hidden="true" />
          <span>Vidalys <b>Radar</b></span>
        </Link>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="mobile-nav-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="radar-sidebar"
        className={[
          "sidebar",
          open ? "mobile-open" : "",
          collapsed ? "is-collapsed" : "",
        ].join(" ")}
      >
        <div className="sidebar-brand-row">
          <Link className="brand brand-link" href="/" onClick={() => setOpen(false)}>
            <span className="brand-mark">
              <img src="/brand/mark.svg" alt="" aria-hidden="true" />
            </span>
            <div className="brand-copy">
              <strong>Vidalys Radar</strong>
              <small>Inteligência para revender</small>
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

        {!collapsed && <ProductSearch onNavigate={() => setOpen(false)} />}

        <nav className="sidebar-nav" aria-label="Navegação principal">
          {menuGroups.map((group, index) => (
            <div className="nav-group" key={group.label ?? "g" + index}>
              {group.label && <span className="nav-group-label">{group.label}</span>}
              <div className="nav-group-items">
                {group.items.map((item) => renderItem(item, isMainActive(item)))}
              </div>
            </div>
          ))}
          <details className="nav-group nav-more" open={moreOpen} onToggle={(event) => setMoreOpen((event.target as HTMLDetailsElement).open)}>
            <summary className="nav-group-label">Mais ferramentas</summary>
            <div className="nav-group-items">
              {[...moreItems, ...(intelligenceEnabled ? [
                { href: "/concorrentes", label: "Concorrentes", icon: "market" as const },
                { href: "/kits", label: "Simulador de kits", icon: "products" as const },
              ] : [])].map((item) => renderItem(item, isActive(item.href)))}
            </div>
          </details>
        </nav>

        <div className="sidebar-account">
          <span className="sidebar-account-avatar">
            {(account.nickname?.trim()[0] || "?").toUpperCase()}
          </span>
          <div className="sidebar-account-copy">
            <strong>
              {account.connected
                ? account.nickname || "Conta conectada"
                : account.loaded
                  ? "Sem conta conectada"
                  : "Carregando..."}
            </strong>
            <small>
              {account.connected
                ? "Mercado Livre conectado"
                : "Conecte em Integrações"}
            </small>
          </div>
          <span
            className={
              "sidebar-account-status" + (account.connected ? "" : " is-offline")
            }
            title={account.connected ? "Conectado" : "Desconectado"}
          />
        </div>

        <button type="button" className="rd-logout" onClick={signOut}>
          <span>Sair</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>

      </aside>
    </>
  );
}
