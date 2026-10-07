#!/usr/bin/env node
// Uso: node scripts/hash-password.mjs "sua-senha-forte"
// Gera o valor para ADMIN_PASSWORD_HASH (e sugere um ADMIN_SESSION_SECRET).
import { randomBytes, scrypt } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Informe uma senha com pelo menos 10 caracteres:\n  node scripts/hash-password.mjs "sua-senha-forte"');
  process.exit(1);
}

const salt = randomBytes(16);
scrypt(password, salt, 64, (error, derived) => {
  if (error) throw error;
  console.log("ADMIN_PASSWORD_HASH=scrypt:" + salt.toString("base64url") + ":" + derived.toString("base64url"));
  console.log("ADMIN_SESSION_SECRET=" + randomBytes(48).toString("base64url"));
});
