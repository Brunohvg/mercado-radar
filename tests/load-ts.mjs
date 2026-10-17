import { readFile } from "node:fs/promises";
import ts from "typescript";
const cache = new Map();
async function moduleUrl(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const source = await readFile(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  let code = outputText;
  for (const match of outputText.matchAll(
    /from ["'](@\/[^"']+|\.\.?\/[^"']+)["']/g,
  )) {
    const name = match[1];
    const dependency = name.startsWith("@/")
      ? new URL("../" + name.slice(2) + ".ts", import.meta.url)
      : new URL(name.endsWith(".ts") ? name : name + ".ts", url);
    code = code.replace(
      match[0],
      "from " + JSON.stringify(await moduleUrl(dependency)),
    );
  }
  const data =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  cache.set(url.href, data);
  return data;
}
export async function loadTs(path) {
  return import(await moduleUrl(new URL(path, import.meta.url)));
}
