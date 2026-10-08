import { AppNavigation } from "@/components/app-navigation";
import { AnalysisHistoryDashboard } from "@/components/analysis-history-dashboard";

export default function AnalysisHistoryPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <AnalysisHistoryDashboard />
      </section>
    </main>
  );
}
