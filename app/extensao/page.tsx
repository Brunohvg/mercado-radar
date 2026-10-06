import { AppNavigation } from "@/components/app-navigation";

export default function ExtensionPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <section className="overview-dashboard extension-install-page">
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

          <section className="extension-install-hero">
            <div className="extension-install-copy">
              <span className="extension-install-kicker">Instalação de desenvolvimento</span>
              <h2>Instale sem baixar o repositório ou abrir o VS Code</h2>
              <p>
                O instalador prepara a versão atual da extensão em uma pasta fixa
                do Windows e abre o Chrome na tela correta. Enquanto a extensão
                não estiver na Chrome Web Store, o Chrome exige apenas a confirmação
                final em modo de desenvolvedor.
              </p>

              <div className="extension-install-actions">
                <a
                  className="extension-install-primary"
                  href="/api/extension/dev-installer"
                  download
                >
                  Preparar extensão no Windows
                </a>

                <a
                  className="extension-install-secondary"
                  href="https://chrome.google.com/webstore"
                  target="_blank"
                  rel="noreferrer"
                >
                  Chrome Web Store — em breve
                </a>
              </div>

              <small>
                Não instala programas externos, não grava token do Mercado Livre e
                não precisa de acesso administrativo ao Windows.
              </small>
            </div>

            <div className="extension-install-steps">
              <div>
                <span>1</span>
                <strong>Baixe e execute</strong>
                <small>MercadoRadar-Instalar.ps1</small>
              </div>
              <div>
                <span>2</span>
                <strong>Ative o modo desenvolvedor</strong>
                <small>O instalador abre chrome://extensions</small>
              </div>
              <div>
                <span>3</span>
                <strong>Carregue a pasta</strong>
                <small>
                  Selecione %LOCALAPPDATA%\MercadoRadar\ExtensionDev
                </small>
              </div>
            </div>
          </section>

          <section className="clean-panel">
            <div className="clean-panel-head">
              <div>
                <span>Status</span>
                <strong>Extensão pronta para testes locais</strong>
              </div>
            </div>
            <div className="clean-mini-grid">
              <div>
                <span>Busca enriquecida</span>
                <strong>Ativa</strong>
                <small>score, demanda, vendas e faturamento</small>
              </div>
              <div>
                <span>Filtros Radar</span>
                <strong>Ativos</strong>
                <small>oportunidade, demanda, margem e histórico</small>
              </div>
              <div>
                <span>Side Panel</span>
                <strong>Ativo</strong>
                <small>analytics, Buy Box, mercado e rentabilidade</small>
              </div>
              <div>
                <span>Atualização</span>
                <strong>Reinstalador</strong>
                <small>rode novamente o instalador para receber a versão atual</small>
              </div>
            </div>
          </section>

          <section className="clean-panel extension-install-note">
            <div>
              <strong>Por que ainda existem 3 cliques no Chrome?</strong>
              <p>
                Extensões fora da Chrome Web Store não podem ser instaladas
                silenciosamente por um site comum. Quando publicarmos a versão
                oficial, este fluxo será substituído por um botão direto para
                “Adicionar ao Chrome”.
              </p>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
