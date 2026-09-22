import { MercadoLivreIntegration } from "@/components/mercado-livre-integration";
import { ProductAnalyzer } from "@/components/product-analyzer";
import { ProductsDashboard } from "@/components/products-dashboard";
import { SalesDashboard } from "@/components/sales-dashboard";
import { OpportunityRadar } from "@/components/opportunity-radar";

const flow = [
  ["01", "Custo real", "Fornecedor + desconto"],
  ["02", "Mercado", "Preço e concorrência"],
  ["03", "Custos ML", "Tarifa + frete"],
  ["04", "Resultado", "Lucro + margem + ROI"],
  ["05", "Operação", "Produtos + vendas reais"],
];

export default function Home() {
  return (
    <main className="shell">
      <input className="mobile-nav-toggle" id="mobile-nav-toggle" type="checkbox" />
      <label className="mobile-nav-button" htmlFor="mobile-nav-toggle" aria-label="Abrir menu">
        <span />
        <span />
        <span />
      </label>
      <label className="mobile-nav-overlay" htmlFor="mobile-nav-toggle" />

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MR</span>
          <div>
            <strong>Mercado Radar</strong>
            <small>Commerce Intelligence</small>
          </div>
        </div>

        <nav>
          <a className="nav-item active" href="#analisar">Analisar produto</a>
          <a className="nav-item" href="#oportunidades">Oportunidades</a>
          <a className="nav-item" href="#produtos">Produtos</a>
          <a className="nav-item" href="#vendas">Vendas</a>
          <a className="nav-item" href="#kits">Simular kits</a>
          <a className="nav-item" href="#integracoes">Integrações</a>
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" />
          Core nativo · PostgreSQL
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Inteligência para revenda</p>
            <h1>
              Decida melhor <em>antes e depois</em> de cada venda.
            </h1>
            <p className="hero-copy">
              Analise oportunidades, acompanhe produtos conectados e transforme
              vendas reais em decisões de margem, estoque e preço.
            </p>
          </div>
          <div className="pill">Meta padrão · 20% margem · 30% ROI</div>
        </header>

        <section className="decision-flow" aria-label="Fluxo de decisão">
          {flow.map(([number, title, description], index) => (
            <div className="flow-step" key={title}>
              <span className="flow-number">{number}</span>
              <div>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
              {index < flow.length - 1 && <span className="flow-arrow">→</span>}
            </div>
          ))}
        </section>

        <section className="summary-grid">
          <article className="metric-card">
            <span>Margem alvo</span>
            <strong>≥ 20%</strong>
            <small>Configurável por operação</small>
          </article>
          <article className="metric-card">
            <span>ROI desejado</span>
            <strong>≥ 30%</strong>
            <small>Retorno sobre capital aplicado</small>
          </article>
          <article className="metric-card">
            <span>Fornecedor</span>
            <strong>Flexível</strong>
            <small>Custo e desconto por produto</small>
          </article>
          <article className="metric-card accent">
            <span>Motor de dados</span>
            <strong>Mercado Livre API</strong>
            <small>Produtos, vendas, tarifa e frete</small>
          </article>
        </section>

        <ProductAnalyzer />
        <OpportunityRadar />
        <ProductsDashboard />
        <SalesDashboard />
        <MercadoLivreIntegration />
      </section>
    </main>
  );
}
