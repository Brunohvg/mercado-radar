"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Product = { mlItemId: string; title: string; thumbnail: string | null; currentPrice: number | null; status: string };

let cache: Product[] | null = null;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Busca rápida de produto no menu: digite parte do nome ou o MLB e vá direto ao que quer fazer. */
export function ProductSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[] | null>(cache);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  async function ensureLoaded() {
    if (cache || failed) return;
    try {
      const response = await fetch("/api/ml/listing-quality", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { products?: Product[] };
      cache = payload.products ?? [];
      setProducts(cache);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2 || !products) return [];
    const words = q.split(/\s+/);
    return products.filter((p) => {
      const hay = norm(p.title + " " + p.mlItemId);
      return words.every((w) => hay.includes(w));
    }).slice(0, 6);
  }, [query, products]);

  // As telas leem ?item= ao abrir; na mesma tela, recarrega para trocar de produto.
  const go = (href: string) => (event: React.MouseEvent) => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    if (href.split("?")[0] === pathname) {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  return (
    <div className="product-search" ref={box}>
      <input
        type="search"
        className="product-search-input"
        placeholder="Buscar produto ou MLB…"
        aria-label="Buscar produto"
        value={query}
        onFocus={() => { setOpen(true); void ensureLoaded(); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      />
      {open && query.trim().length >= 2 && (
        <div className="product-search-results" role="listbox">
          {failed ? (
            <p className="product-search-empty">Conecte o Mercado Livre para buscar seus produtos.</p>
          ) : !products ? (
            <p className="product-search-empty">Carregando produtos…</p>
          ) : results.length === 0 ? (
            <p className="product-search-empty">Nenhum anúncio com esse nome.</p>
          ) : (
            results.map((p) => (
              <div className="product-search-row" key={p.mlItemId}>
                <div className="product-search-title">
                  <strong>{p.title}</strong>
                  <span>
                    {p.mlItemId}
                    {p.currentPrice != null ? " · " + brl(p.currentPrice) : ""}
                    {p.status === "paused" ? " · pausado" : ""}
                  </span>
                </div>
                <div className="product-search-links">
                  <Link href={"/anuncios?item=" + p.mlItemId} onClick={go("/anuncios?item=" + p.mlItemId)}>Ver anúncio</Link>
                  <Link href={"/melhorar-anuncio?item=" + p.mlItemId} onClick={go("/melhorar-anuncio?item=" + p.mlItemId)}>Melhorar</Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
