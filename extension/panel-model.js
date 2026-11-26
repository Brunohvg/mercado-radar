(() => {
  "use strict";
  function money(value) {
    const text = String(value ?? "")
      .trim()
      .replace(/^R\$\s*/, "")
      .replace(/\s/g, "");
    if (!text) return null;
    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : /^\d{1,3}(?:\.\d{3})+$/.test(text)
        ? text.replace(/\./g, "")
        : text;
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  function sample(prices, currentPrice) {
    const sorted = prices
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);
    if (sorted.length < 3) return null;
    const quantile = (p) => {
      const i = (sorted.length - 1) * p;
      return (
        sorted[Math.floor(i)] +
        (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i))
      );
    };
    const median = quantile(0.5);
    return {
      count: sorted.length,
      p25: quantile(0.25),
      median,
      p75: quantile(0.75),
      gap: currentPrice > 0 ? (currentPrice / median - 1) * 100 : null,
    };
  }

  // Offline-only financial scenario. Never label seller-entered values as an
  // official Mercado Livre quote and never infer an absent shipping charge.
  function manualProfitability(input) {
    const fee = input.manualFees;
    const numbers = [
      input.salePrice, input.supplierPrice, input.discountPercent,
      input.kitQuantity, input.taxPercent, input.operatingCost,
      input.targetMarginPercent, input.targetRoiPercent, input.shippingCost,
      fee?.commissionPercent, fee?.fixedFee,
    ];
    if (numbers.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0) ||
      !Number.isInteger(input.kitQuantity) || input.kitQuantity < 1 ||
      input.salePrice <= 0 || input.discountPercent > 95 ||
      input.taxPercent > 50 || fee.commissionPercent > 50 ||
      fee.commissionPercent + input.taxPercent >= 100 ||
      input.targetMarginPercent > 80 || input.targetRoiPercent > 500)
      throw new Error("Informe custos, imposto, comissão, tarifa fixa e frete válidos para a simulação manual.");
    const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const salePrice = input.salePrice;
    const unitCost = round(input.supplierPrice * (1 - input.discountPercent / 100));
    const purchaseCost = round(input.supplierPrice * (1 - input.discountPercent / 100) * input.kitQuantity);
    const commissionAmount = round(salePrice * fee.commissionPercent / 100);
    const saleFeeAmount = round(commissionAmount + fee.fixedFee);
    const taxAmount = round(salePrice * input.taxPercent / 100);
    const amountReceived = round(salePrice - saleFeeAmount - input.shippingCost);
    const profit = round(amountReceived - purchaseCost - input.operatingCost - taxAmount);
    const marginPercent = round(profit / salePrice * 100);
    const investment = purchaseCost + input.operatingCost;
    const roiPercent = investment > 0 ? round(profit / investment * 100) : 0;
    const base = purchaseCost + fee.fixedFee + input.shippingCost + input.operatingCost;
    const rate = (fee.commissionPercent + input.taxPercent) / 100;
    const breakEvenPrice = rate < 1 ? Math.ceil(base / (1 - rate) * 100 - 1e-9) / 100 : null;
    const marginDenominator = 1 - rate - input.targetMarginPercent / 100;
    const marginFloor = marginDenominator > 0 ? base / marginDenominator : Infinity;
    const roiFloor = rate < 1
      ? (base + investment * input.targetRoiPercent / 100) / (1 - rate)
      : Infinity;
    let minimumSuggestedPrice = Number.isFinite(Math.max(marginFloor, roiFloor)) &&
      (investment > 0 || input.targetRoiPercent === 0)
      ? Math.ceil(Math.max(marginFloor, roiFloor) * 100 - 1e-9) / 100 : null;
    if (minimumSuggestedPrice != null) {
      for (let i = 0; i < 20000; i++) {
        const checkProfit = round(minimumSuggestedPrice -
          round(minimumSuggestedPrice * fee.commissionPercent / 100) -
          round(minimumSuggestedPrice * input.taxPercent / 100) -
          fee.fixedFee - input.shippingCost - purchaseCost - input.operatingCost);
        if (checkProfit + 1e-9 >= minimumSuggestedPrice * input.targetMarginPercent / 100 &&
            checkProfit + 1e-9 >= investment * input.targetRoiPercent / 100) break;
        minimumSuggestedPrice = round(minimumSuggestedPrice + 0.01);
        if (i === 19999) minimumSuggestedPrice = null;
      }
    }
    const verdict = profit <= 0 || marginPercent < 10 ? "BAD" :
      marginPercent < input.targetMarginPercent || roiPercent < input.targetRoiPercent ? "TIGHT" : "GOOD";
    const result = {
      ...input, unitCost, purchaseCost, commissionPercent: fee.commissionPercent,
      fixedFee: fee.fixedFee, commissionAmount, saleFeeAmount, taxAmount,
      amountReceived, profit, marginPercent, roiPercent,
      receivedPercent: round(amountReceived / salePrice * 100),
      breakEvenPrice, minimumSuggestedPrice, verdict,
    };
    let adsSimulation = null;
    if (input.advertising) {
      const { roasTarget, attributedSalesPercent } = input.advertising;
      if (!Number.isFinite(roasTarget) || roasTarget <= 0 ||
        !Number.isFinite(attributedSalesPercent) || attributedSalesPercent < 0 ||
        attributedSalesPercent > 100)
        throw new Error("Confira o ROAS e o percentual de vendas atribuídas a Ads.");
      const costPerSale = round(salePrice * attributedSalesPercent / 100 / roasTarget);
      const profitAfterAds = round(profit - costPerSale);
      adsSimulation = {
        source: "USER_SCENARIO", roasTarget, attributedSalesPercent,
        costPerSale, profitAfterAds,
        marginAfterAdsPercent: round(profitAfterAds / salePrice * 100),
        tacosPercent: round(costPerSale / salePrice * 100),
        breakEvenRoas: profit > 0 ? salePrice / profit : null,
      };
    }
    return {
      feeSource: "MANUAL", shippingSource: "MANUAL_ESTIMATE",
      shippingKnown: false, shippingEstimated: false,
      shippingNote: "Frete informado manualmente, não cotado pelo Mercado Livre.",
      note: "Simulação local sem login. Comissão, tarifa fixa e frete são hipóteses informadas por você, não cotação oficial.",
      fees: {
        commissionPercent: fee.commissionPercent, fixedFee: fee.fixedFee,
        commissionAmount, saleFeeAmount, shippingCost: input.shippingCost,
      },
      result, adsSimulation, needs: [],
    };
  }
  globalThis.RadarPanelModel = { money, sample, manualProfitability };
})();
