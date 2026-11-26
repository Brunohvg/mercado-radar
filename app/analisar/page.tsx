import { AppNavigation } from "@/components/app-navigation";
import { ProductAnalyzer } from "@/components/product-analyzer";
import { QuickCalculator } from "@/components/quick-calculator";

export default function AnalyzePage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <QuickCalculator />
        <details className="advanced-analysis">
          <summary>Análise completa (embalagem, kits, Ads e preço sugerido)</summary>
          <ProductAnalyzer />
        </details>
      </section>
    </main>
  );
}
