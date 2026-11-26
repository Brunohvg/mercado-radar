import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { AdvertisingDashboard } from "@/components/advertising-dashboard";

export default function AdvertisingPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="anuncios" current="/publicidade" />
        <AdvertisingDashboard />
      </section>
    </main>
  );
}
