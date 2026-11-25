import { AppNavigation } from "@/components/app-navigation";
import { SourcingWorkspace } from "@/components/sourcing/sourcing-workspace";

export default async function WhereToBuyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SourcingWorkspace id={id} />
      </section>
    </main>
  );
}
