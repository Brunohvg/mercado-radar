import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function marketModelAsset() {
  const source = readFileSync(
    new URL("../lib/market-assessment.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  return (
    "// Generated from lib/market-assessment.ts. Run npm run build:market-model.\n(() => {\nconst exports = {};\n" +
    outputText +
    "\nglobalThis.RadarMarketModel = exports;\n})();\n"
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    new URL("../extension/market-model.js", import.meta.url),
    marketModelAsset(),
  );
}
