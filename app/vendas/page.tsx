import { AppNavigation } from "@/components/app-navigation";
import { SalesDashboard } from "@/components/sales-dashboard";

export default function SalesPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SalesDashboard />
      </section>
    </main>
  );
}
