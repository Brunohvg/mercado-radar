/** Product analysis: automatic reads, explicit evidence, server-side profit formula. */
(() => {
  "use strict";
  const M = globalThis.RadarPanelModel;
  const numeric = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const brl = (value) =>
    numeric(value)
      ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";
  const num = (value) =>
    numeric(value)
      ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : "—";
  const pct = (value) => num(value) + "%";
  function demand(insight) {
    const e = insight?.estimate,
      rate = e?.salesPerDay?.value;
    const dated =
      ["OFICIAL", "HISTORICO"].includes(e?.method) &&
      numeric(e?.windowDays) &&
      e.windowDays >= 1;
    const lifetime =
      e?.method === "VIDA" &&
      numeric(e?.ageDays?.value) &&
      e.ageDays.value >= 1 &&
      e.ageDays.source === "API" &&
      e.sold?.exact;
    if (
      !numeric(rate) ||
      rate < 0 ||
      (!dated && !lifetime) ||
      (e.method === "OFICIAL" && !insight.isOwn)
    )
      return {
        level: null,
        title: "Demanda a confirmar",
        tone: "neutral",
        rate: null,
        basis:
          "Vendidos acumulados e avaliações não informam vendas por período.",
      };
    const level =
      rate >= 10
        ? "EXCELENTE"
        : rate >= 3
          ? "ALTA"
          : rate >= 0.7
            ? "MEDIA"
            : "BAIXA";
    const title = {
      EXCELENTE: "Demanda excelente",
      ALTA: "Alta demanda",
      MEDIA: "Demanda média",
      BAIXA: "Baixa demanda",
    }[level];
    return {
      level,
      title: lifetime ? title + " · histórica" : title,
      tone: level === "BAIXA" ? "warn" : level === "MEDIA" ? "neutral" : "good",
      rate,
      basis: lifetime
        ? "Média desde a criação oficial; não mede a demanda recente."
        : e.method === "OFICIAL"
          ? "Pedidos da sua conta · últimos " + num(e.windowDays) + " dias."
          : "Contador exato entre leituras · " + num(e.windowDays) + " dias.",
    };
  }
  function opportunity(insight, result) {
    const d = demand(insight);
    if (
      result &&
      (result.verdict === "BAD" ||
        result.profit <= 0 ||
        result.marginPercent < 10)
    )
      return {
        tone: "bad",
        title: "Ruim para este custo",
        reason: "A margem simulada fica abaixo de 10% ou há prejuízo.",
      };
    if (d.level === "BAIXA")
      return {
        tone: "warn",
        title: "Oportunidade com pouco giro",
        reason:
          "O ritmo medido fica abaixo de 0,7 unidade por dia. Avalie o capital parado.",
      };
    if (result?.verdict === "TIGHT")
      return {
        tone: "warn",
        title: "Margem apertada",
        reason:
          "A simulação não alcança todas as suas metas de margem e retorno.",
      };
    if (
      result?.verdict === "GOOD" &&
      ["ALTA", "EXCELENTE"].includes(d.level) &&
      insight.estimate.method !== "VIDA"
    )
      return {
        tone: "good",
        title: "Boa oportunidade",
        reason:
          "Demanda medida alta e margem dentro das suas metas. Confira a amostra de preços.",
      };
    if (result?.verdict === "GOOD")
      return {
        tone: "good",
        title: d.level
          ? "Boa margem para analisar"
          : "Boa margem · demanda a confirmar",
        reason:
          "Os custos informados atendem às suas metas. A margem não garante vendas.",
      };
    if (["ALTA", "EXCELENTE"].includes(d.level))
      return {
        tone: "good",
        title: "Demanda forte · avalie o lucro",
        reason:
          "O ritmo de vendas é favorável. Complete seus custos para concluir a viabilidade.",
      };
    return {
      tone: "neutral",
      title: "Análise da oportunidade",
      reason: "Informe o custo de compra para avaliar a margem neste preço.",
    };
  }
  function receipt(quote, price) {
    const f = quote?.fees;
    if (
      !numeric(price) ||
      !numeric(f?.commissionAmount) ||
      !numeric(f?.fixedFee)
    )
      return null;
    const shipKnown = quote.shippingKnown === true && numeric(f.shippingCost);
    return {
      value:
        Math.round(
          (price -
            f.commissionAmount -
            f.fixedFee -
            (shipKnown ? f.shippingCost : 0)) *
            100,
        ) / 100,
      label: shipKnown
        ? "Repasse após tarifas e frete"
        : "Após tarifas, antes do frete",
      shippingKnown: shipKnown,
    };
  }
  function createController({ send, preferences, changed }) {
    let generation = 0,
      timer,
      currentKey = "",
      lastCalculation = "";
    let state = empty();
    function empty() {
      return {
        obs: null,
        status: "idle",
        auth: null,
        taxConfigured: false,
        insight: null,
        item: null,
        quotes: {},
        candidates: [],
        sample: null,
        listingType: "CLASSIC",
        result: null,
        error: "",
        costSource: "",
        fields: { cost: "", shipping: "", tax: "", operating: "0" },
        settings: { margin: 20, roi: 30 },
        edited: new Set(),
        calculating: false,
      };
    }
    const emit = () => changed(state);
    async function request(path, method = "GET", body) {
      try {
        return await send({ type: "RADAR_FETCH", path, method, body });
      } catch {
        return {
          ok: false,
          status: 0,
          body: { error: "Conexão interrompida. Tente atualizar a análise." },
        };
      }
    }
    function alive(revision) {
      return revision === generation;
    }
    function refresh() {
      if (state.obs) void load(state.obs, true);
    }
    function clear() {
      if (!state.obs) return;
      generation++;
      clearTimeout(timer);
      currentKey = "";
      lastCalculation = "";
      state = empty();
      emit();
    }
    function completeFields() {
      const quote = state.quotes[state.listingType];
      const shipping =
        M.money(state.fields.shipping) ??
        (quote?.shippingKnown ? quote.fees.shippingCost : null);
      return {
        cost: M.money(state.fields.cost),
        tax: M.money(state.fields.tax),
        operating: M.money(state.fields.operating),
        shipping,
      };
    }
    function payload(quoteOnly = false, listingType = state.listingType) {
      const fields = completeFields();
      return {
        itemId: state.item?.id || state.obs.id,
        title: state.obs.title,
        categoryId: state.item?.categoryId || state.obs.categoryId || undefined,
        salePrice: state.obs.price,
        supplierPrice: quoteOnly ? 0 : fields.cost,
        discountPercent: 0,
        kitQuantity: 1,
        taxPercent: fields.tax ?? undefined,
        operatingCost: fields.operating ?? 0,
        shippingCost:
          quoteOnly ||
          (!state.edited.has("shipping") &&
            state.quotes[listingType]?.shippingKnown)
            ? undefined
            : (fields.shipping ?? undefined),
        targetMarginPercent: state.settings.margin,
        targetRoiPercent: state.settings.roi,
        listingType,
        logisticType:
          state.item?.logisticType ||
          state.obs.logisticType ||
          (state.obs.fulfillment ? "fulfillment" : "drop_off"),
        freeShipping: state.obs.freeShipping,
        quoteOnly,
      };
    }
    async function calculate() {
      clearTimeout(timer);
      const f = completeFields();
      if (
        !state.obs ||
        !state.auth?.authenticated ||
        state.auth.extensionProtocol !== 2 ||
        f.cost == null ||
        f.tax == null ||
        f.tax > 50 ||
        f.shipping == null ||
        f.shipping > 10000 ||
        f.operating == null ||
        f.cost > 10000000 ||
        !(state.obs.price > 0)
      )
        return;
      const data = payload(),
        key = JSON.stringify(data),
        revision = generation;
      if (key === lastCalculation) return;
      lastCalculation = key;
      state.calculating = true;
      state.error = "";
      state.result = null;
      emit();
      const response = await request(
        "/api/extension/profitability",
        "POST",
        data,
      );
      if (!alive(revision) || key !== lastCalculation) return;
      state.calculating = false;
      if (response?.ok) {
        state.quotes[data.listingType] = response.body;
        state.result = response.body?.result || null;
        if (!state.result)
          state.error =
            response.body?.note || "Faltam tarifas ou custos para calcular.";
      } else {
        state.error =
          response?.status === 401
            ? "Entre no Radar para calcular."
            : response?.body?.error || "Não foi possível calcular agora.";
        lastCalculation = "";
      }
      emit();
    }
    function edit(name, value) {
      if (!Object.hasOwn(state.fields, name)) return;
      state.fields[name] = value;
      state.edited.add(name);
      state.result = null;
      state.error = "";
      state.calculating = false;
      lastCalculation = "";
      if (name === "cost")
        state.costSource = "Custo informado para este produto/kit";
      // Editing also invalidates a result already in flight; its payload can no longer win.
      emit();
      clearTimeout(timer);
      timer = setTimeout(() => void calculate(), 450);
    }
    function selectType(type) {
      if (!["CLASSIC", "PREMIUM"].includes(type) || state.listingType === type)
        return;
      state.listingType = type;
      state.edited.add("listingType");
      state.result = null;
      state.error = "";
      state.calculating = false;
      lastCalculation = "";
      emit();
      void calculate();
    }
    async function load(obs, force = false) {
      if (!obs) {
        clear();
        return;
      }
      const key = JSON.stringify([
        obs.id,
        obs.title,
        obs.price,
        obs.categoryId,
        obs.fulfillment,
        obs.freeShipping,
        obs.soldLower,
        obs.soldHasPlus,
        obs.soldLabel,
        obs.rating,
        obs.reviews,
      ]);
      if (!force && key === currentKey) return;
      const previous = state,
        same = previous.obs?.id === obs.id;
      currentKey = key;
      const revision = ++generation;
      clearTimeout(timer);
      lastCalculation = "";
      state = empty();
      state.obs = obs;
      state.status = "loading";
      if (same) {
        state.fields = { ...previous.fields };
        state.edited = new Set(previous.edited);
        state.costSource = previous.costSource;
      }
      emit();
      const auth = await send({ type: "RADAR_AUTH_STATUS" }).catch(() => null);
      if (!alive(revision)) return;
      state.auth = auth;
      if (!auth?.authenticated || auth.extensionProtocol !== 2) {
        state.status = "connection";
        emit();
        return;
      }
      const p = await preferences().catch(() => ({}));
      if (!alive(revision)) return;
      state.taxConfigured = p.radarTaxPercent != null;
      if (!state.edited.has("tax"))
        state.fields.tax =
          p.radarTaxPercent == null ? "" : String(p.radarTaxPercent);
      if (!state.edited.has("operating"))
        state.fields.operating = String(p.radarOperatingCost ?? 0);
      state.settings = {
        margin: M.money(p.radarTargetMarginPercent) ?? 20,
        roi: M.money(p.radarTargetRoiPercent) ?? 30,
      };
      const history = (async () => {
        const r = await request("/api/extension/observations", "POST", {
          page: "product",
          items: [obs],
        });
        if (!alive(revision)) return;
        state.insight = r?.ok
          ? r.body?.items?.find((i) => i.id === obs.id) || null
          : null;
        emit();
      })();
      const market = (async () => {
        const params = new URLSearchParams({
          title: obs.title,
          itemId: obs.id,
        });
        if (obs.price > 0) params.set("currentPrice", String(obs.price));
        const r = await request("/api/extension/market?" + params);
        if (!alive(revision)) return;
        state.candidates = r?.ok
          ? [
              ...new Map(
                (r.body?.competitors || [])
                  .filter(
                    (c) => c.id !== obs.id && numeric(c.price) && c.price > 0,
                  )
                  .map((c) => [c.id, c]),
              ).values(),
            ]
          : [];
        state.sample = M.sample(
          state.candidates.map((c) => c.price),
          obs.price,
        );
        emit();
      })();
      const details = (async () => {
        const r = await request(
          "/api/extension/item?" +
            new URLSearchParams({
              id: obs.id,
              kind:
                obs.referenceKind ||
                (obs.id.startsWith("MLBU") ? "USER_PRODUCT" : "ITEM"),
            }),
        );
        if (!alive(revision)) return;
        state.item = r?.ok ? r.body?.item || null : null;
        const cost = state.item?.isOwn ? r.body?.savedCost : null;
        if (
          cost &&
          numeric(cost.supplierPrice) &&
          numeric(cost.discountPercent) &&
          !state.edited.has("cost")
        ) {
          state.fields.cost = String(
            Math.round(
              cost.supplierPrice * (1 - cost.discountPercent / 100) * 100,
            ) / 100,
          );
          state.costSource =
            cost.source === "SKU"
              ? "Custo cadastrado no SKU deste anúncio"
              : "Custo cadastrado neste anúncio";
        }
        if (!state.edited.has("listingType"))
          state.listingType =
            state.item?.listingTypeId === "gold_pro" ? "PREMIUM" : "CLASSIC";
        emit();
        if (!(obs.price > 0)) return;
        await Promise.allSettled(
          ["CLASSIC", "PREMIUM"].map(async (type) => {
            const data = payload(true, type),
              quote = await request(
                "/api/extension/profitability",
                "POST",
                data,
              );
            if (!alive(revision)) return;
            state.quotes[type] = quote?.ok
              ? quote.body
              : { error: quote?.body?.error || "Tarifa não disponível" };
            emit();
            if (type === state.listingType) void calculate();
          }),
        );
      })();
      await Promise.allSettled([history, market, details]);
      if (!alive(revision)) return;
      state.status = "ready";
      emit();
    }
    return {
      load,
      clear,
      refresh,
      edit,
      selectType,
      calculate,
      get state() {
        return state;
      },
    };
  }
  function mount(root, controller, { connect, advanced }) {
    const $ = (tag, text, cls) => {
      const node = document.createElement(tag);
      if (text != null) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const style = $("style");
    style.textContent = `
      .auto-analysis{padding-top:12px;min-width:0}.auto-verdict{padding:11px 12px;border-radius:9px;background:#f1f5f1;border:1px solid #e0e8e0}.auto-verdict.good{background:#edf7ef;border-color:#cfe5d3}.auto-verdict.bad{background:#fff0eb;border-color:#f0d4ca}.auto-verdict.warn{background:#fff8e8;border-color:#eddfb9}.auto-verdict strong{display:block;font-size:15px;letter-spacing:-.3px}.auto-verdict p{margin-top:4px;font-size:10px}.auto-badge{display:inline-block;border-radius:5px;padding:3px 5px;margin-top:8px;font-size:10px;background:#edf2ee;color:#47654f}.auto-badge.good{background:#e1f1e4;color:#12603b}.auto-badge.warn{background:#fff0cf;color:#845916}.auto-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.auto-metric{padding:9px;background:#f7f9f7;border-radius:8px;min-width:0}.auto-metric small{display:block;font-size:9px}.auto-metric strong{font-size:16px;display:block;overflow-wrap:anywhere}.auto-source{font-size:9px;margin-top:7px;color:#708273;line-height:1.5}.auto-receipt{border-top:1px solid #e0e9df;margin-top:12px;padding-top:12px}.auto-receipt>small{display:block}.auto-receipt>strong{display:block;font-size:24px;letter-spacing:-.6px;margin-top:2px}.auto-types{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:7px}.auto-types button{padding:6px;min-height:31px;font-size:10px}.auto-types button[aria-pressed=true]{background:#e5f2e8;border-color:#82b293;color:#125a39}.auto-analysis details{border-top:1px solid #e1e9e1;margin-top:10px;padding-top:8px}.auto-analysis summary{font-size:10px;color:#5d7764;cursor:pointer}.auto-breakdown{margin:8px 0 0;font-size:10px}.auto-breakdown div{display:flex;justify-content:space-between;gap:8px;padding:4px 0}.auto-breakdown dt{color:#60796a}.auto-breakdown dd{margin:0;font-variant-numeric:tabular-nums}.auto-calc{margin-top:12px;padding-top:11px;border-top:1px solid #dfe9df}.auto-calc label{display:block;font-size:10px;color:#40624d;font-weight:600;margin-bottom:5px}.auto-calc input{box-sizing:border-box;width:100%;min-width:0;min-height:35px;border:1px solid #c4d7c8;border-radius:7px;padding:7px 9px;color:#183e2b;background:white;font:13px system-ui}.auto-calc input[aria-invalid=true]{border-color:#b94832}.auto-calc .auto-grid{margin-top:9px}.auto-result{background:#eaf5ec;border:1px solid #cde1d1;border-radius:9px;padding:10px;margin-top:10px}.auto-result.bad{background:#fff0eb;border-color:#f0d4ca}.auto-result strong{display:block;font-size:22px}.auto-result small{display:block}.auto-result p{font-size:10px;margin-top:4px}.auto-helper{margin-top:8px;font-size:10px}.auto-connection button{width:100%;margin-top:8px}.auto-candidate{padding:5px 0;border-bottom:1px solid #edf1ec;font-size:10px}.auto-candidate b{display:block;margin-top:2px}.auto-calc .auto-operating{margin-top:9px}.auto-readout{font-size:10px;margin-top:9px;color:#607a68}.auto-update{display:flex;justify-content:space-between;gap:5px;margin-top:8px;align-items:center}.auto-update button{padding:3px;font-size:9px;min-height:22px;border:0;background:transparent;color:#58705c}.auto-update small{font-size:9px}.auto-inputs[hidden],.auto-analysis [hidden]{display:none!important}
    `;
    style.textContent += `
      @container (min-width:660px){.auto-analysis{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:26px;padding-top:16px}.auto-overview{grid-column:1;grid-row:1}.auto-receipt{grid-column:1;grid-row:2}.auto-calc{grid-column:2;grid-row:1/span 2;margin-top:0;padding-top:0;border-top:0}.auto-analysis>details,.auto-connection,.auto-update,.auto-analysis>button{grid-column:1/-1}.auto-analysis>button{justify-self:end;width:auto}.auto-verdict strong{font-size:20px}.auto-verdict p,.auto-helper{font-size:12px}.auto-metric strong{font-size:20px}.auto-source,.auto-readout{font-size:11px}.auto-calc label{font-size:12px}.auto-calc input{min-height:40px}.auto-result strong{font-size:28px}.auto-result p{font-size:12px}.auto-result{padding:14px}.auto-types button{font-size:12px;min-height:36px}.auto-analysis summary{font-size:12px}.auto-breakdown,.auto-candidate{font-size:12px}}
    `;
    const container = $("div", null, "auto-analysis"),
      verdict = $("div", null, "auto-verdict"),
      verdictTitle = $("strong"),
      reason = $("p"),
      badge = $("span", null, "auto-badge");
    verdict.append(verdictTitle, reason);
    const overview = $("section", null, "auto-overview");
    overview.append(verdict, badge);
    container.append(overview);
    const grid = $("div", null, "auto-grid"),
      metrics = [];
    for (const label of ["Vendas por dia", "Preço vs. candidatos"]) {
      const box = $("div", null, "auto-metric"),
        value = $("strong", "—");
      box.append($("small", label), value);
      grid.append(box);
      metrics.push(value);
    }
    const source = $("p", "", "auto-source"),
      publicLine = $("p", "", "auto-readout");
    overview.append(grid, source, publicLine);
    const payout = $("div", null, "auto-receipt"),
      payoutLabel = $("small"),
      payoutValue = $("strong"),
      types = $("div", null, "auto-types"),
      typeButtons = {};
    for (const [type, label] of [
      ["CLASSIC", "Clássico"],
      ["PREMIUM", "Premium"],
    ]) {
      const b = $("button", label);
      b.type = "button";
      b.addEventListener("click", () => controller.selectType(type));
      typeButtons[type] = b;
      types.append(b);
    }
    const quoteNote = $("p", "", "auto-source"),
      feeDetails = $("details"),
      breakdown = $("dl", null, "auto-breakdown");
    feeDetails.append($("summary", "Tarifas e origem da cotação"), breakdown);
    payout.append(payoutLabel, payoutValue, types, quoteNote, feeDetails);
    container.append(payout);
    const form = $("form", null, "auto-calc"),
      fields = {},
      fieldWraps = {};
    const makeField = (name, label, parent) => {
      const wrap = $("div"),
        id = "radar-auto-" + name;
      const text = $("label", label);
      text.htmlFor = id;
      const input = $("input");
      input.id = id;
      input.inputMode = "decimal";
      input.placeholder =
        name === "cost"
          ? "Informe seu custo para este anúncio"
          : "Confirme, inclusive zero";
      input.addEventListener("input", () => controller.edit(name, input.value));
      wrap.append(text, input);
      parent.append(wrap);
      fields[name] = input;
      fieldWraps[name] = wrap;
    };
    makeField("cost", "Seu custo do produto/kit · R$", form);
    const costSource = $("p", "", "auto-source");
    form.append(costSource);
    const missing = $("div", null, "auto-grid");
    makeField("shipping", "Seu frete por venda · R$", missing);
    makeField("tax", "Seu imposto · %", missing);
    form.append(missing);
    const advancedCosts = $("details"),
      operations = $("div", null, "auto-operating");
    advancedCosts.append($("summary", "Ajustar imposto e operação"));
    const taxEdit = $("input");
    taxEdit.inputMode = "decimal";
    taxEdit.id = "radar-auto-tax-edit";
    const taxLabel = $("label", "Imposto aplicado · %");
    taxLabel.htmlFor = taxEdit.id;
    taxEdit.addEventListener("input", () =>
      controller.edit("tax", taxEdit.value),
    );
    operations.append(taxLabel, taxEdit);
    makeField("operating", "Embalagem e operação · R$", operations);
    advancedCosts.append(operations);
    form.append(advancedCosts);
    const helper = $("p", "", "auto-helper"),
      resultBox = $("div", null, "auto-result"),
      profit = $("strong"),
      profitDetails = $("p");
    resultBox.append(
      $("small", "Lucro simulado por venda"),
      profit,
      profitDetails,
    );
    form.append(helper, resultBox);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void controller.calculate();
    });
    container.append(form);
    const marketDetails = $("details"),
      marketSummary = $("summary", "Faixa preliminar de preços"),
      range = $("p", "", "auto-helper"),
      candidateList = $("div");
    marketDetails.append(
      marketSummary,
      range,
      $(
        "p",
        "Candidatos automáticos: confira marca, quantidade, medida e condição.",
        "auto-source",
      ),
      candidateList,
    );
    container.append(marketDetails);
    const connection = $("div", null, "auto-connection"),
      connectButton = $("button", "Conectar minha conta");
    connectButton.type = "button";
    connectButton.addEventListener("click", connect);
    connection.append(connectButton);
    container.append(connection);
    const update = $("div", null, "auto-update"),
      status = $("small"),
      retry = $("button", "Atualizar análise ↻");
    retry.type = "button";
    retry.addEventListener("click", () => controller.refresh());
    const more = $("button", "Calculadora completa ↗");
    more.type = "button";
    more.addEventListener("click", advanced);
    update.append(status, retry);
    container.append(update, more);
    root.append(style, container);
    function syncInput(input, value) {
      if (input.getRootNode().activeElement !== input && input.value !== value)
        input.value = value;
    }
    return {
      render(s) {
        if (!s.obs) return;
        const d = demand(s.insight),
          o = opportunity(s.insight, s.result),
          quote = s.quotes[s.listingType],
          received = receipt(quote, s.obs.price),
          f = quote?.fees;
        verdict.className = "auto-verdict " + o.tone;
        verdictTitle.textContent =
          s.status === "loading" && !s.insight
            ? "Analisando este produto…"
            : o.title;
        reason.textContent = o.reason;
        badge.className = "auto-badge " + d.tone;
        badge.textContent = d.title;
        metrics[0].textContent =
          d.rate == null ? "Sem período" : num(d.rate) + " un.";
        metrics[1].textContent =
          s.sample?.gap == null
            ? "Sem amostra"
            : (s.sample.gap > 0 ? "+" : "") + pct(s.sample.gap);
        source.textContent =
          d.basis +
          (s.sample
            ? " Preço comparado com " +
              s.sample.count +
              " candidatos, ainda sem revisão."
            : "");
        publicLine.textContent = [
          s.obs.soldLabel ||
            (s.obs.soldLower == null
              ? null
              : (s.obs.soldHasPlus ? "+" : "") +
                num(s.obs.soldLower) +
                " vendidos"),
          s.obs.rating == null ? null : "★ " + num(s.obs.rating),
          s.obs.reviews == null ? null : num(s.obs.reviews) + " avaliações",
          s.obs.fulfillment ? "Full" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        payoutLabel.textContent = received?.label || "Repasse após tarifas";
        payoutValue.textContent = received
          ? brl(received.value)
          : s.status === "loading"
            ? "Consultando…"
            : "Tarifa indisponível";
        for (const [type, b] of Object.entries(typeButtons)) {
          b.setAttribute("aria-pressed", String(s.listingType === type));
          b.textContent =
            (type === "CLASSIC" ? "Clássico" : "Premium") +
            (numeric(s.quotes[type]?.fees?.commissionPercent)
              ? " · " + pct(s.quotes[type].fees.commissionPercent)
              : "");
        }
        const actualType =
          s.item?.listingTypeId === "gold_pro"
            ? "PREMIUM"
            : s.item?.listingTypeId === "gold_special"
              ? "CLASSIC"
              : null;
        quoteNote.textContent =
          (actualType
            ? "Anúncio " +
              (actualType === "PREMIUM" ? "Premium" : "Clássico") +
              " na API. " +
              (actualType === s.listingType
                ? "Cotação da mesma modalidade. "
                : "Simulando outra modalidade. ")
            : "Modalidade simulada; não confirmada para este anúncio. ") +
          (quote?.categorySource === "PREDICTED"
            ? "Categoria sugerida pelo título. "
            : "") +
          "Repasse não é lucro: faltam compra, imposto e operação.";
        breakdown.replaceChildren();
        for (const [label, value] of [
          ["Comissão", f?.commissionAmount],
          ["Tarifa fixa", f?.fixedFee],
          [
            "Frete do vendedor",
            received?.shippingKnown ? f.shippingCost : null,
          ],
        ]) {
          const row = $("div");
          row.append($("dt", label), $("dd", brl(value)));
          breakdown.append(row);
        }
        form.hidden = s.status === "connection";
        for (const [name, input] of Object.entries(fields)) {
          syncInput(input, s.fields[name]);
          const v = M.money(input.value);
          input.setAttribute(
            "aria-invalid",
            String(
              input.value !== "" &&
                (v == null ||
                  (name === "tax" && v > 50) ||
                  (name === "shipping" && v > 10000)),
            ),
          );
        }
        syncInput(taxEdit, s.fields.tax);
        costSource.textContent = s.costSource;
        fieldWraps.shipping.hidden = received?.shippingKnown === true;
        fieldWraps.tax.hidden = s.taxConfigured;
        missing.hidden = fieldWraps.shipping.hidden && fieldWraps.tax.hidden;
        helper.textContent = s.calculating
          ? "Calculando automaticamente…"
          : s.error ||
            (s.result
              ? "Tarifas e custos desta simulação. Não inclui Ads ou devoluções."
              : [
                  M.money(s.fields.cost) == null
                    ? "Informe o custo de compra."
                    : null,
                  !received?.shippingKnown && M.money(s.fields.shipping) == null
                    ? "Confirme seu frete."
                    : null,
                  M.money(s.fields.tax) == null
                    ? "Confirme seu imposto."
                    : null,
                ]
                  .filter(Boolean)
                  .join(" "));
        resultBox.hidden = !s.result;
        resultBox.className =
          "auto-result" + (s.result?.verdict === "BAD" ? " bad" : "");
        profit.textContent = brl(s.result?.profit);
        profitDetails.textContent =
          "Margem " +
          pct(s.result?.marginPercent) +
          " · ROI " +
          pct(s.result?.roiPercent);
        marketSummary.textContent = s.sample
          ? "Faixa preliminar · " +
            brl(s.sample.p25) +
            " a " +
            brl(s.sample.p75)
          : "Preços · amostra ainda insuficiente";
        range.textContent = s.sample
          ? "Mediana " +
            brl(s.sample.median) +
            " · " +
            s.sample.count +
            " candidatos. Sem frete do comprador."
          : "São necessários pelo menos três candidatos comparáveis com preço.";
        candidateList.replaceChildren();
        for (const c of s.candidates.slice(0, 6)) {
          const row = $("div", c.title, "auto-candidate");
          row.append($("b", brl(c.price)));
          candidateList.append(row);
        }
        connection.hidden = s.status !== "connection";
        connectButton.textContent = s.auth?.authenticated
          ? "Atualizar extensão e servidor"
          : "Conectar minha conta";
        status.textContent =
          s.status === "loading"
            ? "Consultas automáticas em andamento"
            : s.status === "connection"
              ? "Entre para consultar dados da sua conta"
              : "Leitura e análise automáticas";
        retry.disabled = s.status === "loading";
      },
    };
  }
  function mountSummary(root, controller, { adjust }) {
    const make = (tag, cls) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    const style = make("style");
    style.textContent =
      ".auto-summary{padding-top:11px}.auto-summary h2{font-size:15px;line-height:1.4}.auto-summary h2.good{color:#146e46}.auto-summary h2.bad{color:#a14430}.auto-summary h2.warn{color:#916a21}.auto-summary p{font-size:10px;margin-top:5px}.auto-summary .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.auto-summary .mini-grid div{padding:8px;background:#f4f8f4;border-radius:8px;min-width:0}.auto-summary small{display:block;font-size:9px}.auto-summary strong{display:block;font-size:18px;overflow-wrap:anywhere}.auto-summary button{font-size:10px;padding:3px;min-height:25px;margin-top:6px;border:0;background:transparent}";
    const wrap = make("div", "auto-summary"),
      title = make("h2"),
      evidence = make("p"),
      grid = make("div", "mini-grid"),
      values = [],
      labels = [];
    for (let i = 0; i < 2; i++) {
      const box = make("div"),
        label = make("small"),
        value = make("strong");
      labels.push(label);
      values.push(value);
      box.append(label, value);
      grid.append(box);
    }
    const edit = make("button");
    edit.type = "button";
    edit.textContent = "Ver análise e ajustar custo ↓";
    edit.addEventListener("click", adjust);
    wrap.append(title, evidence, grid, edit);
    root.append(style, wrap);
    return {
      render(s) {
        const d = demand(s.insight),
          o = opportunity(s.insight, s.result),
          received = receipt(s.quotes[s.listingType], s.obs?.price);
        title.textContent =
          s.status === "loading" && !s.insight
            ? "Analisando este produto…"
            : o.title;
        title.className = o.tone;
        evidence.textContent =
          d.title + (d.rate == null ? "" : " · " + num(d.rate) + " un./dia");
        labels[0].textContent = s.result
          ? "Lucro por venda"
          : received?.shippingKnown
            ? "Repasse após frete"
            : "Após tarifas · antes do frete";
        values[0].textContent = brl(s.result?.profit ?? received?.value);
        labels[1].textContent = s.result
          ? "Margem simulada"
          : "Preço vs. candidatos";
        values[1].textContent = s.result
          ? pct(s.result.marginPercent)
          : s.sample?.gap == null
            ? "Sem amostra"
            : (s.sample.gap > 0 ? "+" : "") + pct(s.sample.gap);
      },
    };
  }
  globalThis.RadarProductAnalysis = {
    demand,
    opportunity,
    receipt,
    createController,
    mount,
    mountSummary,
  };
})();
