/** Execução da pesquisa com IA: chama o Gemini com Google Search e confere contatos. */
import { requestGemini, getGeminiModel, geminiIsConfigured } from "@/lib/ai/gemini-listing";
import {
  buildResearchPrompt,
  confirmContacts,
  parseJsonLoose,
  reconcileAiSuppliers,
  groundedSources,
  type AiResearch,
  type AiSupplierCandidate,
  type GroundingChunk,
} from "@/lib/sourcing/ai-research";
import { fetchPublicPageText } from "@/lib/sourcing/safe-page";
import type { ProductIdentity } from "@/lib/sourcing/identity";

/** Liga só com RADAR_AI_PROVIDER=gemini, chave e RADAR_AI_SUPPLIER_SEARCH=1 (a pesquisa com Google Search é cobrada à parte). */
export function aiSupplierSearchEnabled() {
  return geminiIsConfigured() && process.env.RADAR_AI_SUPPLIER_SEARCH?.trim() === "1";
}

export async function runAiSupplierResearch(
  identity: ProductIdentity,
  extra: { categoryPath?: string[] } = {},
): Promise<{ research: AiResearch; candidates: AiSupplierCandidate[] }> {
  const empty = (status: AiResearch["status"], message: string, model: string | null = null) => ({
    research: { status, message, model, webQueries: [], searchEntryPointHtml: null, sources: [], rejected: 0 },
    candidates: [] as AiSupplierCandidate[],
  });
  if (!aiSupplierSearchEnabled()) return empty("INDISPONIVEL", "Pesquisa com IA desligada nesta instalação.");
  let model: string;
  try {
    model = getGeminiModel();
  } catch (error) {
    return empty("INDISPONIVEL", error instanceof Error ? error.message : "Modelo inválido.");
  }
  let payload: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: GroundingChunk[];
        searchEntryPoint?: { renderedContent?: string };
      };
    }>;
  };
  try {
    payload = (await requestGemini(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildResearchPrompt(identity, extra) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 2500, temperature: 0 },
        }),
      },
      45000,
    )) as typeof payload;
  } catch (error) {
    return empty("INDISPONIVEL", error instanceof Error ? error.message : "IA indisponível agora.", model);
  }
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const meta = candidate?.groundingMetadata ?? {};
  const chunks = meta.groundingChunks ?? [];
  const { candidates, rejected } = reconcileAiSuppliers(parseJsonLoose(text), chunks);
  const confirmed = await Promise.all(
    candidates.map(async (c) => {
      if (!c.phone && !c.email && !c.cnpj) return c;
      const page = await fetchPublicPageText(c.url);
      return page ? confirmContacts(c, page) : c;
    }),
  );
  return {
    research: {
      status: confirmed.length ? "OK" : "SEM_RESULTADO",
      message: confirmed.length
        ? null
        : chunks.length
          ? "A IA não encontrou fornecedor com fonte verificável. Tente os links de pesquisa."
          : "A pesquisa do Google não trouxe fontes para este produto.",
      model,
      webQueries: (meta.webSearchQueries ?? []).slice(0, 8),
      searchEntryPointHtml: meta.searchEntryPoint?.renderedContent ?? null,
      sources: groundedSources(chunks).slice(0, 12).map(({ title, url }) => ({ title, url })),
      rejected,
    },
    candidates: confirmed,
  };
}
