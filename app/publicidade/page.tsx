import { AppNavigation } from "@/components/app-navigation";
import { AdvertisingDashboard } from "@/components/advertising-dashboard";

export default function AdvertisingPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <AdvertisingDashboard />
      </section>
    </main>
  );
}
