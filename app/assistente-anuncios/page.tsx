import { AppNavigation } from "@/components/app-navigation";
import { ListingDraftAssistant } from "@/components/listing-draft-assistant";

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
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <ListingDraftAssistant
          initialName={single(params.produto)}
          initialReference={single(params.referencia)}
          fromExtension={params.origem === "extensao"}
        />
      </section>
    </main>
  );
}
