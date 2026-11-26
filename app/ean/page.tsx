import { AppNavigation } from "@/components/app-navigation";
import { EanBatchDashboard } from "@/components/ean-batch-dashboard";

export default function EanBatchPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <EanBatchDashboard />
      </section>
    </main>
  );
}
