import { AppNavigation } from "@/components/app-navigation";
import { MercadoLivreIntegration } from "@/components/mercado-livre-integration";

export default function IntegrationsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <MercadoLivreIntegration />
      </section>
    </main>
  );
}
