"use client";

import { useEffect, useState } from "react";

export type DraftValues = {
  name: string; barcode: string | null; brand: string; sku: string;
  categoryId: string; categoryName: string; catalogProductId: string | null;
  title: string; description: string; confirmedFacts: string;
  missingFacts: string[];
  imageUrls: string[]; stock: number;
  attributes: Record<string, string>;
  costPerUnit: number | null; kitQuantity: number;
  discountPercent: number; operatingCost: number;
  listingType: "CLASSIC" | "PREMIUM";
  logisticType: string; freeShipping: boolean | null;
  weightGrams: number | null; heightCm: number | null;
  widthCm: number | null; lengthCm: number | null;
  suggestedPrice: number | null; profit: number | null; marginPercent: number | null;
};

type DraftSummary = { id: string; status: string; name: string; updatedAt: string };
type Saved = { id: string; data: DraftValues; status: string; mlItemId?: string | null };

export function ListingDraftManager({
  data, onRestore,
}: {
  data: DraftValues;
  onRestore: (data: DraftValues) => void;
}) {
  const [draftId, setDraftId] = useState("");
  const [list, setList] = useState<DraftSummary[]>([]);
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description);
  const [stock, setStock] = useState("0");
  const [photos, setPhotos] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [requiredAttributes, setRequiredAttributes] = useState<Array<{ id: string; name: string; values: Array<{ id: string; name: string }> }>>([]);
  const [categoryStatus, setCategoryStatus] = useState("");
  const [validated, setValidated] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [publishedId, setPublishedId] = useState("");
  const [publishedLink, setPublishedLink] = useState("");
  const [requiresSave, setRequiresSave] = useState(true);

  useEffect(() => { setTitle(data.title); }, [data.title]);
  useEffect(() => { setDescription(data.description); }, [data.description]);
  useEffect(() => {
    if (!data.categoryId) { setRequiredAttributes([]); return; }
    let active = true;
    setCategoryStatus("Consultando ficha técnica do Mercado Livre…");
    fetch("/api/ml/category-attributes?categoryId=" + encodeURIComponent(data.categoryId), { cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível consultar atributos.");
        return result;
      })
      .then(result => { if (active) {
        setRequiredAttributes(result.required ?? []);
        setCategoryStatus((result.required?.length ?? 0) + " atributo(s) exigido(s) pela categoria.");
      } })
      .catch(error => { if (active) {
        setRequiredAttributes([]);
        setCategoryStatus(error instanceof Error ? error.message : "Ficha técnica indisponível.");
      } });
    return () => { active = false; };
  }, [data.categoryId]);

  async function refresh() {
    try {
      const r = await fetch("/api/listing-drafts", { cache: "no-store" });
      if (r.ok) setList((await r.json()).drafts ?? []);
    } catch { /* Status stays visible; retry on next save. */ }
  }
  useEffect(() => { void refresh(); }, []);

  async function restore(id: string) {
    if (!id) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/listing-drafts?id=" + encodeURIComponent(id), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Rascunho não encontrado.");
      const saved = result.draft as Saved;
      setDraftId(saved.id);
      setTitle(saved.data.title);
      setDescription(saved.data.description);
      setStock(String(saved.data.stock));
      setPhotos((saved.data.imageUrls || []).join("\n"));
      setAttributes(saved.data.attributes ?? {});
      setIssues([]);
      setValidated(false);
      setRequiresSave(false);
      setPublishConfirmed(false);
      setPublishedId(saved.mlItemId || "");
      onRestore(saved.data);
      setMessage("Rascunho recuperado. Calcule novamente as tarifas antes de publicar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao reabrir rascunho.");
    } finally { setPending(false); }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      const existing = photos.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (existing.length + files.length > 12) throw new Error("Use no máximo 12 fotos.");
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/listing-drafts/photos", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao enviar imagem.");
        uploaded.push(result.url);
      }
      setPhotos([...existing, ...uploaded].join("\n"));
      setValidated(false);
      setRequiresSave(true);
      setMessage(uploaded.length + " foto(s) enviada(s). Salve o rascunho para associá-las ao produto.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível enviar imagens.");
    } finally { setUploading(false); }
  }

  async function save() {
    if (!data.name || /^\d{8,14}$/.test(data.name)) {
      setMessage("Identifique o nome comercial do produto antes de salvar.");
      return;
    }
    const imageUrls = photos.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (imageUrls.some(url => !url.startsWith("https://") && !url.startsWith("/api/listing-drafts/photos/"))) {
      setMessage("As fotos precisam de URLs HTTPS próprias.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/listing-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(draftId ? { id: draftId } : {}),
          data: {
            ...data, title: title.trim(), description: description.trim(), attributes,
            stock: Math.max(0, Math.trunc(Number(stock) || 0)),
            imageUrls,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível salvar." +
          (result.details?.length ? " Campos: " + result.details.join(", ") : ""));
      }
      setDraftId(result.draft.id);
      setIssues(result.issues ?? []);
      setValidated(false);
      setRequiresSave(false);
      setPublishConfirmed(false);
      setMessage(result.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally { setPending(false); }
  }

  async function publication(action: "validate" | "publish") {
    if (!draftId) { setMessage("Salve o rascunho primeiro."); return; }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/listing-drafts/publication", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draftId, action, confirmed: action === "publish" && publishConfirmed }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.causes) && result.causes.length
          ? " " + result.causes.map((c: {message?: string}) => c.message).join("; ")
          : "";
        throw new Error((result.error || "Falha na validação.") + details);
      }
      setMessage(result.message);
      if (action === "validate") setValidated(true);
      if (action === "publish") {
        setPublishedId(result.mlItemId || "");
        setPublishedLink(result.permalink || "");
        setValidated(false);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na publicação.");
      setValidated(false);
    } finally { setPending(false); }
  }

  return (
    <section className="listing-draft-workspace" aria-label="Salvar e revisar anúncio">
      <div className="listing-draft-workspace__heading">
        <div>
          <h3>Finalizar e salvar anúncio</h3>
          <p>Edite a proposta da IA e continue depois sem perder os dados.</p>
        </div>
        <button type="button" className="secondary" disabled={pending} onClick={() => {
          setDraftId(""); setStock("0"); setPhotos("");
          setIssues([]); setMessage("Novo rascunho iniciado.");
        }}>Novo</button>
      </div>
      <label className="field listing-assistant__field">
        <span>Meus rascunhos</span>
        <select value={draftId} disabled={pending} onChange={e => void restore(e.target.value)}>
          <option value="">Novo anúncio — escolher um salvo</option>
          {list.map(row => (
            <option key={row.id} value={row.id}>
              {row.name.slice(0, 56)} · {new Date(row.updatedAt).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
      </label>
      <label className="field listing-assistant__field">
        <span>Título comercial (editável)</span>
        <input maxLength={120} value={title} onChange={e => { setTitle(e.target.value); setValidated(false); setRequiresSave(true); }} />
      </label>
      <label className="field listing-assistant__field">
        <span>Descrição verificada</span>
        <textarea rows={7} maxLength={7500} value={description} onChange={e => { setDescription(e.target.value); setValidated(false); setRequiresSave(true); }}
          placeholder="Gere o texto com IA ou descreva as características comprovadas." />
      </label>
      <label className="field listing-assistant__field">
        <span>Estoque disponível</span>
        <input inputMode="numeric" value={stock} onChange={e => { setStock(e.target.value); setValidated(false); setRequiresSave(true); }} placeholder="Quantidade" />
      </label>
      <label className="field listing-assistant__field">
        <span>Adicionar fotos reais do produto</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || pending}
          onChange={e => { void uploadPhotos(e.target.files); e.target.value = ""; }} />
        <small>JPG, PNG ou WebP, até 7 MB por imagem. Armazenadas no seu workspace.</small>
      </label>
      <label className="field listing-assistant__field">
        <span>Fotos salvas e links externos (uma por linha)</span>
        <textarea rows={3} value={photos} onChange={e => { setPhotos(e.target.value); setValidated(false); setRequiresSave(true); }}
          placeholder="/api/listing-drafts/photos/... ou https://seusite.com.br/imagem.jpg" />
      {photos && <div className="listing-draft-workspace__photos">
        {photos.split(/[\n,]/).map(x => x.trim()).filter(Boolean).slice(0, 12).map((url, i) =>
          <img key={url + i} src={url} alt={"Foto de produto " + (i + 1)} loading="lazy" />
        )}
      </div>}
      </label>
      {data.categoryId && (
        <div className="listing-draft-workspace__attributes">
          <strong>Ficha técnica da categoria</strong>
          <p className="listing-assistant__helper">{categoryStatus || "Consultando requisitos…"}</p>
          {requiredAttributes.map(attr => (
            <label key={attr.id} className="field listing-assistant__field">
              <span>{attr.name} (obrigatório)</span>
              {attr.values.length > 0 && attr.values.length < 40 ? (
                <select value={attributes[attr.id] ?? ""} onChange={e => { setAttributes(prev => ({ ...prev, [attr.id]: e.target.value })); setValidated(false); setRequiresSave(true); }}>
                  <option value="">Selecione ou informe abaixo</option>
                  {attr.values.map(v => <option key={v.id || v.name} value={v.name}>{v.name}</option>)}
                </select>
              ) : (
                <input value={attributes[attr.id] ?? ""} maxLength={255} onChange={e => { setAttributes(prev => ({ ...prev, [attr.id]: e.target.value })); setValidated(false); setRequiresSave(true); }} placeholder="Valor confirmado do produto" />
              )}
            </label>
          ))}
        </div>
      )}
      {message && <p className="listing-draft-workspace__message" role="status">{message}</p>}
      {issues.length > 0 && (
        <div className="listing-draft-workspace__issues">
          <strong>O que falta para um anúncio completo</strong>
          <ul>{issues.map(x => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <button type="button" className="primary listing-assistant__button" disabled={pending || uploading || Boolean(publishedId)} onClick={() => void save()}>
        {pending ? "Salvando…" : draftId ? "Salvar alterações do rascunho" : "Salvar rascunho"}
      </button>
      {!publishedId && draftId && issues.length === 0 && !requiresSave && (
        <div className="listing-draft-workspace__publication">
          <strong>Etapa final — Mercado Livre</strong>
          <p className="listing-assistant__helper">A pré-validação consulta regras reais do Mercado Livre e verifica novamente tarifas e frete.</p>
          <button type="button" className="secondary listing-assistant__button" onClick={() => void publication("validate")} disabled={pending || uploading}>
            {pending ? "Validando…" : "Validar anúncio na API do Mercado Livre"}
          </button>
          {validated && <>
            <label className="listing-draft-workspace__confirmation">
              <input type="checkbox" checked={publishConfirmed} onChange={e => setPublishConfirmed(e.target.checked)} />
              <span>Confirmo que revisei os dados e quero criar um anúncio PAUSADO na minha conta Mercado Livre.</span>
            </label>
            <button type="button" className="primary listing-assistant__button" disabled={!publishConfirmed || pending} onClick={() => void publication("publish")}>
              Criar anúncio pausado no Mercado Livre
            </button>
          </>}
        </div>
      )}
      {publishedId && <p className="listing-draft-workspace__message">Anúncio criado pausado: <strong>{publishedId}</strong>.
        {publishedLink.startsWith("https://") && <a href={publishedLink} target="_blank" rel="noopener noreferrer"> Abrir no Mercado Livre</a>}
      </p>}
      <p className="listing-assistant__note">
        Salvar não publica no Mercado Livre. Antes da publicação, será preciso validar
        atributos obrigatórios, imagens e regras atuais da categoria.
      </p>
    </section>
  );
}
