export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  // Spreadsheet programs can execute formula-like strings even inside quotes.
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function buildCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
