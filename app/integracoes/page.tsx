import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { MercadoLivreIntegration } from "@/components/mercado-livre-integration";

export default function IntegrationsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="configuracoes" current="/integracoes" />
        <MercadoLivreIntegration />
      </section>
    </main>
  );
}
