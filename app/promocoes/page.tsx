import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { PromotionsDashboard } from "@/components/promotions-dashboard";

export default function PromotionsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="anuncios" current="/promocoes" />
        <PromotionsDashboard />
      </section>
    </main>
  );
}
