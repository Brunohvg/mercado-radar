import { AppNavigation } from "@/components/app-navigation";
import { ListingDraftAssistant } from "@/components/listing-draft-assistant";

import { loadListingReference } from "@/lib/listing-reference";

import { sourcingUser, loadOpportunityView, SourcingError } from "@/lib/sourcing/service";

type Params = {
  estudo?: string;
  cotacao?: string;
  produto?: string | string[];
  referencia?: string | string[];
  origem?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value.slice(0, 180) : "";
}

export default async function ListingAssistantPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const market = params.origem === "concorrencia";
  const reference = market ? await loadListingReference(single(params.referencia)).catch(() => null) : null;
  let quotation: { name: string; supplier: string; packageCost: number } | undefined;
  if (typeof params.estudo === "string" && typeof params.cotacao === "string") {
    const user = await sourcingUser();
    const study = await loadOpportunityView(user.workspaceId, single(params.estudo)).catch(error => {
      if (error instanceof SourcingError && error.status === 404) return null;
      throw error;
    });
    const quote = study?.quotes.find(q => q.id === params.cotacao);
    if (quote?.viability.status === "CALCULADO" && !quote.viability.purchasePending.length && study?.sale.saleUnits) {
      quotation = { name: study.opportunity.title, supplier: quote.viability.supplierName,
        packageCost: Math.round(quote.viability.landedUnitCost * study.sale.saleUnits * 100) / 100 };
    }
  }
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <a className="inline-link-button" href="/anuncios">Voltar para anúncios</a>
        {params.cotacao && !quotation && <p role="status">A cotação precisa ser revisada. Informe o custo antes de preparar a publicação.</p>}
        <ListingDraftAssistant
          key={[params.estudo, params.cotacao, single(params.referencia)].join("/")}
          quotation={quotation}
          publishingEnabled={process.env.RADAR_ENABLE_PUBLISHING === "true"}
          marketReference={market ? reference : undefined}
          initialName={quotation?.name || reference?.title || single(params.produto)}
          initialReference={single(params.referencia)}
          fromExtension={params.origem === "extensao"}
        />
      </section>
    </main>
  );
}
