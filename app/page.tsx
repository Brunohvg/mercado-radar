import { MercadoLivreIntegration } from "@/components/mercado-livre-integration";
import { ProductAnalyzer } from "@/components/product-analyzer";

const flow = [
  ["01", "Custo real", "Fornecedor + desconto"],
  ["02", "Mercado", "Preço e concorrência"],
  ["03", "Custos ML", "Tarifa + frete"],
  ["04", "Resultado", "Lucro + margem + ROI"],
  ["05", "Decisão", "Testar, kit ou descartar"],
];

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
          <a className="nav-item" href="#integracoes">Integrações</a>
          <a className="nav-item muted" href="#produtos">Produtos <span>em breve</span></a>
          <a className="nav-item muted" href="#vendas">Vendas <span>em breve</span></a>
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
            <h1>Saiba se vale vender <em>antes</em> de colocar dinheiro no estoque.</h1>
            <p className="hero-copy">
              Um painel para transformar custo, preço, frete e tarifa em uma decisão clara.
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
            <small>Faixa saudável para escalar</small>
          </article>
          <article className="metric-card">
            <span>ROI desejado</span>
            <strong>≥ 30%</strong>
            <small>Retorno sobre capital aplicado</small>
          </article>
          <article className="metric-card">
            <span>Desconto Bibelô</span>
            <strong>35%</strong>
            <small>Editável por produto</small>
          </article>
          <article className="metric-card accent">
            <span>Motor de dados</span>
            <strong>Mercado Livre API</strong>
            <small>Tarifa e frete da sua conta</small>
          </article>
        </section>

        <ProductAnalyzer />
        <MercadoLivreIntegration />
      </section>
    </main>
  );
}
