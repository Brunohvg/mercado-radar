#!/usr/bin/env node
// Gera a pasta dist/extension-prod pronta para zipar e enviar à Chrome Web Store:
// copia /extension e troca manifest.json pelo manifest.prod.json (sem localhost).
import { cpSync, rmSync, mkdirSync, renameSync, existsSync } from "node:fs";

const out = "dist/extension-prod";
rmSync(out, { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("extension", out, { recursive: true });

if (!existsSync(out + "/manifest.prod.json")) throw new Error("manifest.prod.json não encontrado");
rmSync(out + "/manifest.json");
renameSync(out + "/manifest.prod.json", out + "/manifest.json");
rmSync(out + "/README.md", { force: true });

console.log("OK → " + out + "\nZip: cd dist && zip -r mercado-radar-extension.zip extension-prod");
