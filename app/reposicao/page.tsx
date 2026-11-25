import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { PurchaseOrders } from "@/components/purchase-orders";

export default function PurchaseOrderPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="anuncios" current="/reposicao" />
        <PurchaseOrders />
      </section>
    </main>
  );
}
