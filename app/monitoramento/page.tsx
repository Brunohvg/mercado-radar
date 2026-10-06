import { AppNavigation } from "@/components/app-navigation";
import { MonitoringDashboard } from "@/components/monitoring-dashboard";

export default function MonitoringPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <MonitoringDashboard />
      </section>
    </main>
  );
}
