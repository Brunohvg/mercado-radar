import { AppNavigation } from "@/components/app-navigation";

export default function ExtensionPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <section className="overview-dashboard">
          <header className="page-header clean-page-header">
            <div>
              <p className="page-kicker">Mercado Radar</p>
              <h1>Extensão Radar</h1>
              <p>
                Inteligência do Radar diretamente nas buscas e anúncios do Mercado Livre.
              </p>
            </div>
            <span className="health-badge good">Beta</span>
          </header>

          <section className="clean-panel">
            <div className="clean-panel-head">
              <div>
                <span>Status</span>
                <strong>Fundação da extensão em desenvolvimento</strong>
              </div>
            </div>
            <div className="clean-mini-grid">
              <div>
                <span>Busca enriquecida</span>
                <strong>Ativa no MVP</strong>
                <small>score, demanda, vendas e faturamento</small>
              </div>
              <div>
                <span>Filtros Radar</span>
                <strong>Ativos no MVP</strong>
                <small>oportunidade, demanda, vendas e idade</small>
              </div>
              <div>
                <span>Side Panel</span>
                <strong>Ativo no MVP</strong>
                <small>analytics, Buy Box e tendências</small>
              </div>
              <div>
                <span>Rentabilidade</span>
                <strong>Ativa no MVP</strong>
                <small>comissão, frete, imposto, margem e ROI</small>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
