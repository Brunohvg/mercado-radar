import Link from "next/link";

// Abas que agrupam telas antigas sob os itens do menu enxuto.
export const SECTION_TABS = {
  configuracoes: [
    { href: "/configuracoes", label: "Metas e impostos" },
    { href: "/integracoes", label: "Mercado Livre" },
    { href: "/extensao", label: "Extensão" },
  ],
  anuncios: [
    { href: "/anuncios", label: "Anúncios" },
    { href: "/produtos", label: "Produtos" },
    { href: "/fornecedores", label: "Custos por fornecedor" },
  ],
} as const;

export function SectionTabs({ section, current }: { section: keyof typeof SECTION_TABS; current: string }) {
  return (
    <nav className="section-tabs" aria-label="Seções">
      {SECTION_TABS[section].map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={tab.href === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
