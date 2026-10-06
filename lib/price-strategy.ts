export type CompetitivePriceAction =
  | "HOLD"
  | "RAISE"
  | "REDUCE"
  | "RAISE_OR_EXIT";

export type CompetitivePriceStrategy = {
  action: CompetitivePriceAction;
  currentPrice: number;
  marketReferencePrice: number;
  safeFloor: number;
  breakEvenPrice: number;
  recommendedPrice: number;
  gapToMarketPercent: number;
  safetyRoomPercent: number;
  message: string;
  caveat: string;
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function buildCompetitivePriceStrategy(input: {
  currentPrice: number;
  marketReferencePrice: number;
  minimumSuggestedPrice: number;
  breakEvenPrice: number;
}): CompetitivePriceStrategy {
  const currentPrice = Math.max(0, input.currentPrice);
  const marketReferencePrice = Math.max(0, input.marketReferencePrice);
  const safeFloor = Math.max(0, input.minimumSuggestedPrice);
  const breakEvenPrice = Math.max(0, input.breakEvenPrice);

  const gapToMarketPercent =
    marketReferencePrice > 0
      ? ((currentPrice - marketReferencePrice) / marketReferencePrice) * 100
      : 0;

  const safetyRoomPercent =
    marketReferencePrice > 0
      ? ((marketReferencePrice - safeFloor) / marketReferencePrice) * 100
      : 0;

  const winReference = Math.max(0, marketReferencePrice - 0.01);

  let action: CompetitivePriceAction = "HOLD";
  let recommendedPrice = currentPrice;
  let message = "Mantenha o preço atual enquanto os demais sinais estiverem saudáveis.";

  if (currentPrice < safeFloor) {
    action = "RAISE_OR_EXIT";
    recommendedPrice = safeFloor;
    message =
      "Seu preço atual está abaixo do piso necessário para cumprir as metas. Suba o preço ou reavalie o produto.";
  } else if (marketReferencePrice < safeFloor) {
    action = "HOLD";
    recommendedPrice = currentPrice;
    message =
      "Não acompanhe esse preço de mercado: ele fica abaixo do seu piso saudável.";
  } else if (currentPrice > marketReferencePrice + 0.01) {
    action = "REDUCE";
    recommendedPrice = Math.max(safeFloor, winReference);
    message =
      "Existe espaço para reduzir de forma controlada sem romper seu piso saudável.";
  } else if (currentPrice + 0.01 < winReference) {
    action = "RAISE";
    recommendedPrice = Math.max(safeFloor, winReference);
    message =
      "Você está abaixo da referência. Há espaço para subir o preço e preservar competitividade.";
  }

  return {
    action,
    currentPrice: round2(currentPrice),
    marketReferencePrice: round2(marketReferencePrice),
    safeFloor: round2(safeFloor),
    breakEvenPrice: round2(breakEvenPrice),
    recommendedPrice: round2(recommendedPrice),
    gapToMarketPercent: round2(gapToMarketPercent),
    safetyRoomPercent: round2(safetyRoomPercent),
    message,
    caveat:
      "Preço é apenas um dos fatores competitivos. Esta recomendação não garante Buy Box ou posição.",
  };
}
