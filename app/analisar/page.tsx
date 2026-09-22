import { AppNavigation } from "@/components/app-navigation";
import { ProductAnalyzer } from "@/components/product-analyzer";

export default function AnalyzePage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <ProductAnalyzer />
      </section>
    </main>
  );
}
