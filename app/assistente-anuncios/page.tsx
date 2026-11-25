import { AppNavigation } from "@/components/app-navigation";
import { ListingDraftAssistant } from "@/components/listing-draft-assistant";

import { loadListingReference } from "@/lib/listing-reference";

type Params = {
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
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <a className="inline-link-button" href="/anuncios">Voltar para anúncios</a>
        <ListingDraftAssistant
          key={single(params.referencia)}
          marketReference={market ? reference : undefined}
          initialName={reference?.title || single(params.produto)}
          initialReference={single(params.referencia)}
          fromExtension={params.origem === "extensao"}
        />
      </section>
    </main>
  );
}
