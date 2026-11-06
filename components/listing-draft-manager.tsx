"use client";

import { useEffect, useState } from "react";

export type DraftValues = {
  name: string; barcode: string | null; brand: string; sku: string;
  categoryId: string; categoryName: string; catalogProductId: string | null;
  title: string; description: string; confirmedFacts: string;
  missingFacts: string[];
  imageUrls: string[]; stock: number;
  costPerUnit: number | null; kitQuantity: number;
  discountPercent: number; operatingCost: number;
  listingType: "CLASSIC" | "PREMIUM";
  logisticType: string; freeShipping: boolean | null;
  weightGrams: number | null; heightCm: number | null;
  widthCm: number | null; lengthCm: number | null;
  suggestedPrice: number | null; profit: number | null; marginPercent: number | null;
};

type DraftSummary = { id: string; status: string; name: string; updatedAt: string };
type Saved = { id: string; data: DraftValues; status: string };

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

  useEffect(() => { setTitle(data.title); }, [data.title]);
  useEffect(() => { setDescription(data.description); }, [data.description]);

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
      setIssues([]);
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
            ...data, title: title.trim(), description: description.trim(),
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
      setMessage(result.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
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
        <input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
      </label>
      <label className="field listing-assistant__field">
        <span>Descrição verificada</span>
        <textarea rows={7} maxLength={7500} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Gere o texto com IA ou descreva as características comprovadas." />
      </label>
      <label className="field listing-assistant__field">
        <span>Estoque disponível</span>
        <input inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} placeholder="Quantidade" />
      </label>
      <label className="field listing-assistant__field">
        <span>Adicionar fotos reais do produto</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || pending}
          onChange={e => { void uploadPhotos(e.target.files); e.target.value = ""; }} />
        <small>JPG, PNG ou WebP, até 7 MB por imagem. Armazenadas no seu workspace.</small>
      </label>
      <label className="field listing-assistant__field">
        <span>Fotos salvas e links externos (uma por linha)</span>
        <textarea rows={3} value={photos} onChange={e => setPhotos(e.target.value)}
          placeholder="/api/listing-drafts/photos/... ou https://seusite.com.br/imagem.jpg" />
      {photos && <div className="listing-draft-workspace__photos">
        {photos.split(/[\n,]/).map(x => x.trim()).filter(Boolean).slice(0, 12).map((url, i) =>
          <img key={url + i} src={url} alt={"Foto de produto " + (i + 1)} loading="lazy" />
        )}
      </div>}
      </label>
      {message && <p className="listing-draft-workspace__message" role="status">{message}</p>}
      {issues.length > 0 && (
        <div className="listing-draft-workspace__issues">
          <strong>O que falta para um anúncio completo</strong>
          <ul>{issues.map(x => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <button type="button" className="primary listing-assistant__button" disabled={pending || uploading} onClick={() => void save()}>
        {pending ? "Salvando…" : draftId ? "Salvar alterações do rascunho" : "Salvar rascunho"}
      </button>
      <p className="listing-assistant__note">
        Salvar não publica no Mercado Livre. Antes da publicação, será preciso validar
        atributos obrigatórios, imagens e regras atuais da categoria.
      </p>
    </section>
  );
}
