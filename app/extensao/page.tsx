import { AppNavigation } from "@/components/app-navigation";

export default function ExtensionPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <section className="extension-install-page">
          <header className="page-header clean-page-header">
            <div>
              <p className="page-kicker">Configuração</p>
              <h1>Extensão Radar</h1>
              <p>
                Inteligência do Radar diretamente nas buscas e anúncios do Mercado Livre.
              </p>
            </div>
            <span className="status-chip attention extension-install-beta">Versão beta</span>
          </header>

          <section className="clean-panel extension-install-hero">
            <div className="extension-install-copy">
              <span className="extension-install-kicker">Instalação no Windows</span>
              <h2>Instale em poucos cliques, sem baixar código</h2>
              <p>
                O instalador prepara a versão atual da extensão em uma pasta fixa
                do Windows e abre o Chrome na tela correta. Enquanto a extensão
                não estiver na Chrome Web Store, o Chrome exige apenas a confirmação
                final em modo de desenvolvedor.
              </p>

              <div className="extension-install-actions">
                <a
                  className="primary extension-install-primary"
                  href="/api/extension/dev-installer-cmd"
                  download
                >
                  Instalar extensão no Windows
                </a>

                <a
                  className="secondary extension-install-secondary"
                  href="https://chrome.google.com/webstore"
                  target="_blank"
                  rel="noreferrer"
                >
                  Chrome Web Store (em breve)
                </a>
              </div>

              <small>
                Não instala programas externos, não grava token do Mercado Livre e
                não precisa de acesso administrativo ao Windows.
              </small>
            </div>

            <ol className="extension-install-steps" aria-label="Passo a passo">
              <li>
                <span aria-hidden="true">1</span>
                <strong>Dê dois cliques no instalador</strong>
                <small>Execute o MercadoRadar-Instalar.cmd baixado. Ele prepara a pasta correta sozinho.</small>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <strong>O Chrome será aberto</strong>
                <small>Na tela de extensões, deixe o Modo do desenvolvedor ativado (canto superior direito).</small>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <strong>Carregue a pasta gerada</strong>
                <small>
                  Clique em “Carregar sem compactação” e selecione somente a pasta{" "}
                  <code>%LOCALAPPDATA%\MercadoRadar\ExtensionDev</code>. Não
                  selecione a pasta Downloads nem o instalador.
                </small>
              </li>
            </ol>
          </section>

          <section className="clean-panel extension-install-status">
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
                <span>Painel lateral</span>
                <strong>Ativo</strong>
                <small>métricas, Buy Box, mercado e rentabilidade</small>
              </div>
              <div>
                <span>Atualização</span>
                <strong>Manual</strong>
                <small>rode novamente o instalador para receber a versão atual</small>
              </div>
            </div>
          </section>

          <section className="clean-panel extension-install-note">
            <div>
              <strong>Por que ainda há três cliques no Chrome?</strong>
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
