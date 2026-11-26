import { AppNavigation } from "@/components/app-navigation";
import { ExecutiveDashboard } from "@/components/executive-dashboard";

export default function Home() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <ExecutiveDashboard />
      </section>
    </main>
  );
}
