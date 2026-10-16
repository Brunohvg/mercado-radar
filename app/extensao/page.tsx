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
                Abra um produto e veja a análise automática de demanda, tarifas,
                preços e margem, com a origem de cada dado.
              </p>
            </div>
            <span className="status-chip attention extension-install-beta">
              Beta 0.9.0
            </span>
          </header>

          <section className="clean-panel extension-install-hero">
            <div className="extension-install-copy">
              <span className="extension-install-kicker">
                Instalação no Windows
              </span>
              <h2>Instale em poucos cliques, sem baixar código</h2>
              <p>
                O instalador prepara a versão atual da extensão em uma pasta
                fixa do Windows e abre o Chrome na tela correta. Enquanto a
                extensão não estiver na Chrome Web Store, o Chrome exige apenas
                a confirmação final em modo de desenvolvedor.
              </p>

              <div className="extension-install-actions">
                <a
                  className="primary extension-install-primary"
                  href="/api/extension/dev-installer-cmd"
                  download
                >
                  Instalar extensão no Windows
                </a>

                <span
                  className="secondary extension-install-secondary"
                  aria-disabled="true"
                >
                  Chrome Web Store · publicação pendente
                </span>
              </div>

              <small>
                Não instala programas externos, não grava token do Mercado Livre
                e não precisa de acesso administrativo ao Windows.
              </small>
            </div>

            <ol className="extension-install-steps" aria-label="Passo a passo">
              <li>
                <span aria-hidden="true">1</span>
                <strong>Dê dois cliques no instalador</strong>
                <small>
                  Execute o MercadoRadar-Instalar.cmd baixado. Ele prepara a
                  pasta correta sozinho.
                </small>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <strong>O Chrome será aberto</strong>
                <small>
                  Na tela de extensões, deixe o Modo do desenvolvedor ativado
                  (canto superior direito).
                </small>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <strong>Carregue a pasta gerada</strong>
                <small>
                  Clique em “Carregar sem compactação” e selecione somente a
                  pasta <code>%LOCALAPPDATA%\MercadoRadar\ExtensionDev</code>.
                  Não selecione a pasta Downloads nem o instalador.
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
                <span>Leitura da página</span>
                <strong>Ativa</strong>
                <small>
                  preço, texto de vendidos e avaliações, quando exibidos
                </small>
              </div>
              <div>
                <span>Comparação de preços</span>
                <strong>Ativos</strong>
                <small>
                  marque anúncios na busca e leve a amostra revisada ao painel
                </small>
              </div>
              <div>
                <span>Ferramentas contextuais</span>
                <strong>Ativo</strong>
                <small>
                  menu rápido, calculadora por anúncio e monitoramento por
                  leitura
                </small>
              </div>
              <div>
                <span>Atualização</span>
                <strong>Manual</strong>
                <small>
                  atualize os arquivos, recarregue a extensão no Chrome e a aba
                  do Mercado Livre
                </small>
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
