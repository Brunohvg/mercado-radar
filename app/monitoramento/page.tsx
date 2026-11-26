import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { MonitoringDashboard } from "@/components/monitoring-dashboard";

export default function MonitoringPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="mercado" current="/monitoramento" />
        <MonitoringDashboard />
      </section>
    </main>
  );
}
