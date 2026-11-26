"use client";

import { useEffect } from "react";

// No celular as tabelas viram cartões (CSS em styles/responsive.css). Para cada
// célula mostrar o nome da coluna, copiamos o texto do cabeçalho em data-label.
function labelTables(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>("main table")) {
    const heads = [...table.querySelectorAll<HTMLTableCellElement>("thead th")].flatMap((th) =>
      Array.from({ length: th.colSpan || 1 }, () => th.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    );
    if (!heads.length) continue;
    table.classList.add("is-labeled");
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      let col = 0;
      for (const cell of row.cells) {
        const label = cell.colSpan > 1 ? "" : (heads[col] ?? "");
        if (cell.dataset.label !== label) cell.dataset.label = label;
        col += cell.colSpan || 1;
      }
    }
  }
}

export function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTables(document));
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
