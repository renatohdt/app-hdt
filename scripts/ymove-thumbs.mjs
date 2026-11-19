/**
 * Busca a CAPA (thumbnail) de uma lista de exercícios da YMove e salva num arquivo,
 * para o Claude gravar as capas no banco DEV.
 *
 * Como rodar (na raiz do projeto):
 *   node scripts/ymove-thumbs.mjs
 *
 * Lê os IDs de "Claude outputs/ymove-ids-lote1.txt" (separados por vírgula)
 * e grava "Claude outputs/ymove-thumbs-lote1.json" no formato { "id": "url-da-capa" | null }.
 *
 * Atenção: cada ID consultado conta 1 exercício no limite do plano YMove.
 * Só a capa é salva: links de vídeo (que vencem em 48h) NUNCA são gravados.
 * Precisa de YMOVE_API_KEY no .env.local. A chave nunca é impressa na tela.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length && !process.env[key.trim()]) {
        process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    console.log("⚠️  .env.local não encontrado — usando variáveis do ambiente do sistema.");
  }
}

loadEnv();

const KEY = process.env.YMOVE_API_KEY?.trim();
const BASE = "https://exercise-api.ymove.app/api/v2";
const OUT_DIR = resolve(process.cwd(), "Claude outputs");
const IDS_FILE = resolve(OUT_DIR, "ymove-ids-lote1.txt");
const OUT_FILE = resolve(OUT_DIR, "ymove-thumbs-lote1.json");

if (!KEY) {
  console.error("❌ YMOVE_API_KEY não encontrada no .env.local");
  process.exit(1);
}

const asRecord = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

function readImageUrl(v) {
  if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  const r = asRecord(v);
  if (!r) return null;
  for (const k of ["url", "src", "href"]) {
    if (typeof r[k] === "string" && /^https?:\/\//.test(r[k])) return r[k];
  }
  return null;
}

// Mesma ordem de preferência do app (lib/ymove.ts): paisagem primeiro.
function extractThumb(ex) {
  if (!ex) return null;
  const thumbs = ex.thumbnails;
  const rec = asRecord(thumbs);
  for (const k of ["landscape", "default", "original", "square", "portrait"]) {
    const f = readImageUrl(rec?.[k]);
    if (f) return f;
  }
  if (Array.isArray(thumbs)) {
    for (const item of thumbs) {
      const f = readImageUrl(item);
      if (f) return f;
    }
  }
  for (const k of ["thumbnailUrl", "thumbnail", "posterUrl", "poster", "imageUrl", "image"]) {
    const f = readImageUrl(ex[k]);
    if (f) return f;
  }
  const v0 = Array.isArray(ex.videos) ? asRecord(ex.videos[0]) : null;
  if (v0) {
    for (const k of ["thumbnailUrl", "thumbnail", "posterUrl", "poster"]) {
      const f = readImageUrl(v0[k]);
      if (f) return f;
    }
    if (v0.thumbnails) return extractThumb(v0);
  }
  return null;
}

function unwrap(body) {
  const r = asRecord(body);
  return asRecord(r?.data) ?? asRecord(r?.exercise) ?? r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ids = readFileSync(IDS_FILE, "utf-8").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  console.log(`🔎 Buscando capas de ${ids.length} exercícios...`);
  const result = {};
  let ok = 0;
  for (const [i, id] of ids.entries()) {
    try {
      const res = await fetch(`${BASE}/exercises/${encodeURIComponent(id)}`, { headers: { "X-API-Key": KEY } });
      if (!res.ok) {
        console.log(`   ${i + 1}/${ids.length} ${id}: HTTP ${res.status}`);
        result[id] = null;
      } else {
        const thumb = extractThumb(unwrap(await res.json()));
        result[id] = thumb;
        if (thumb) ok++;
        console.log(`   ${i + 1}/${ids.length} ${id}: ${thumb ? "capa ok" : "SEM capa"}`);
      }
    } catch (e) {
      console.log(`   ${i + 1}/${ids.length} ${id}: erro ${e.message}`);
      result[id] = null;
    }
    await sleep(250);
  }
  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`\n✅ Pronto: ${ok}/${ids.length} capas salvas em ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});
