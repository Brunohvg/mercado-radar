"use client";
import { useEffect, useState } from "react";

export type IntelligenceDraft = {
  id: string;
  name: string;
  kind: "RESEARCH" | "KIT";
  payload: unknown;
  updatedAt: string;
};
export function IntelligenceDrafts({
  kind,
  name,
  payload,
  onOpen,
  canSave = true,
}: {
  kind: IntelligenceDraft["kind"];
  name: string;
  payload: unknown;
  onOpen: (draft: IntelligenceDraft) => void;
  canSave?: boolean;
}) {
  const [drafts, setDrafts] = useState<IntelligenceDraft[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/intelligence/drafts", { cache: "no-store" });
    const body = await r.json();
    if (!r.ok)
      throw new Error(body.error ?? "Não foi possível carregar os rascunhos.");
    setDrafts(body.drafts.filter((d: IntelligenceDraft) => d.kind === kind));
  }
  useEffect(() => {
    let active = true;
    load().catch((error) => {
      if (active) setMessage(error.message);
    });
    return () => {
      active = false;
    };
  }, [kind]);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/intelligence/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.slice(0, 120), kind, payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
      setMessage(
        "Rascunho salvo nesta operação e conta. Nenhum anúncio foi publicado.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const r = await fetch(
        "/api/intelligence/drafts?id=" + encodeURIComponent(id),
        { method: "DELETE" },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await load();
      setMessage("Rascunho excluído.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="intel-drafts" aria-label="Rascunhos">
      <div className="intel-toolbar">
        <div>
          <h2>Rascunhos da sua conta</h2>
          <p>Guarde as escolhas para continuar depois.</p>
        </div>
        <button
          className="secondary"
          disabled={busy || !canSave}
          onClick={save}
        >
          {busy ? "Salvando…" : "Salvar rascunho"}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {drafts.length > 0 ? (
        <details>
          <summary>{drafts.length} rascunho(s) salvo(s)</summary>
          <ul className="intel-draft-list">
            {drafts.map((d) => (
              <li key={d.id}>
                <button className="text-button" onClick={() => onOpen(d)}>
                  {d.name}
                </button>
                <small>
                  {new Date(d.updatedAt).toLocaleDateString("pt-BR")}
                </small>
                <button
                  disabled={busy}
                  className="text-button"
                  aria-label={`Excluir ${d.name}`}
                  onClick={() => remove(d.id)}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="intel-muted">Nenhum rascunho salvo nesta conta.</p>
      )}
    </section>
  );
}
