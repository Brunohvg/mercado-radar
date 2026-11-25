import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";

export default function ExtensionPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="configuracoes" current="/extensao" />
        <section className="extension-install-page">
          <header className="page-header clean-page-header">
            <div>
              <p className="page-kicker">Configuração</p>
              <h1>Extensão Radar</h1>
              <p>
                Abra um produto e analise demanda e preços sem login. Para margem,
                use custos manuais; cotações oficiais exigem uma conta conectada.
              </p>
            </div>
            <span className="status-chip attention extension-install-beta">
              Beta 0.14.0
            </span>
          </header>

          <section className="clean-panel extension-install-hero">
            <div className="extension-install-copy">
              <span className="extension-install-kicker">
                Instalação no Windows e Linux
              </span>
              <h2>Instale no Chrome ou Chromium</h2>
              <p>
                Escolha o instalador para seu sistema. Ele prepara os arquivos da extensão em uma pasta local, sem modificar o sistema ou exigir acesso administrativo. No navegador, confirme a instalação em modo de desenvolvedor.
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
                  href="/api/extension/linux-installer"
                  download
                >
                  Instalar extensão no Linux
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
                  No Windows, execute MercadoRadar-Instalar.cmd. No Linux,
                  abra o terminal na pasta de downloads e rode
                  <code>bash MercadoRadar-Instalar-Linux.sh</code>.
                </small>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <strong>Abra as extensões no navegador</strong>
                <small>
                  Abra <code>chrome://extensions</code> no Chrome ou Chromium e
                  ative o Modo do desenvolvedor.
                </small>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <strong>Carregue a pasta gerada</strong>
                <small>
                  Clique em “Carregar sem compactação” e selecione somente a
                  pasta aberta pelo instalador. No Linux, fica em
                  <code>~/.local/share/MercadoRadar/ExtensionBeta</code> para
                  homologação ou <code>ExtensionDev</code> na produção.
                  Não selecione a pasta Downloads nem o instalador.
                </small>
              </li>
            </ol>
          </section>
        </section>
      </section>
    </main>
  );
}
