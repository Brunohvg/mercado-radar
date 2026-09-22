import { ProductAnalyzer } from "@/components/product-analyzer";

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MR</span>
          <div>
            <strong>Mercado Radar</strong>
            <small>Product Intelligence</small>
          </div>
        </div>

        <nav>
          <a className="nav-item active" href="#analisar">Analisar produto</a>
          <a className="nav-item" href="#kits">Simular kits</a>
          <a className="nav-item muted" href="#produtos">Produtos <span>em breve</span></a>
          <a className="nav-item muted" href="#vendas">Vendas <span>em breve</span></a>
          <a className="nav-item muted" href="#integracoes">Integrações <span>em breve</span></a>
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" />
          MVP conectado ao PostgreSQL
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operação Mercado Livre</p>
            <h1>Descubra antes de comprar se o produto dá dinheiro.</h1>
          </div>
          <div className="pill">Meta padrão: 20% margem · 30% ROI</div>
        </header>

        <section className="summary-grid">
          <article className="metric-card">
            <span>Regra principal</span>
            <strong>Margem ≥ 20%</strong>
            <small>Verde para escalar</small>
          </article>
          <article className="metric-card">
            <span>ROI desejado</span>
            <strong>≥ 30%</strong>
            <small>Sobre capital do produto</small>
          </article>
          <article className="metric-card">
            <span>Desconto Bibelô</span>
            <strong>35%</strong>
            <small>Editável por produto</small>
          </article>
          <article className="metric-card accent">
            <span>Próxima integração</span>
            <strong>Mercado Livre API</strong>
            <small>Tarifa + frete automáticos</small>
          </article>
        </section>

        <ProductAnalyzer />
      </section>
    </main>
  );
}
