import { AppNavigation } from "@/components/app-navigation";
import { SourcingHome } from "@/components/sourcing/sourcing-home";

export default function WhereToBuyPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SourcingHome />
      </section>
    </main>
  );
}
