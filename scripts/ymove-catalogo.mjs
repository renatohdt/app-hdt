/**
 * Baixa o catálogo de exercícios da YMove SEM VÍDEOS (não gasta o limite do plano)
 * e salva em "Claude outputs/ymove-catalogo.json" para montar a planilha de academia.
 *
 * Como rodar (na raiz do projeto):
 *   node scripts/ymove-catalogo.mjs
 *
 * Precisa de YMOVE_API_KEY no .env.local. A chave nunca é impressa na tela.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

if (!KEY) {
  console.error("❌ YMOVE_API_KEY não encontrada no .env.local");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": KEY } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const preview = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
    throw new Error(`HTTP ${res.status} em ${path}: ${preview}`);
  }
  return body;
}

// Acha a lista de exercícios dentro da resposta, seja qual for o formato.
function extractList(body) {
  if (Array.isArray(body)) return body;
  for (const k of ["data", "exercises", "items", "results"]) {
    if (Array.isArray(body?.[k])) return body[k];
    if (Array.isArray(body?.data?.[k])) return body.data[k];
  }
  return [];
}

// Remove qualquer campo de vídeo (por garantia: links de vídeo não podem ser salvos).
function stripVideos(ex) {
  const copy = { ...ex };
  for (const k of Object.keys(copy)) {
    if (/video/i.test(k)) delete copy[k];
  }
  return copy;
}

async function main() {
  console.log("🔎 Baixando listas de apoio (grupos musculares, equipamentos, tipos)...");
  const extras = {};
  for (const [name, path] of [
    ["muscleGroups", "/exercises/muscle-groups"],
    ["equipment", "/exercises/equipment"],
    ["exerciseTypes", "/exercises/exercise-types"]
  ]) {
    try {
      extras[name] = await get(path);
    } catch (e) {
      extras[name] = { erro: e.message };
    }
  }

  console.log("🔎 Baixando exercícios (sem vídeos)...");
  const all = new Map();
  // Modo "browse" (sem includeVideos): não traz vídeo nem capa e NÃO conta no limite do plano.
  let firstPageRaw = null;
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, 400); page++) {
    const body = await get(`/exercises?page=${page}&pageSize=100&limit=100`);
    if (page === 1) firstPageRaw = body;
    const reported = Number(body?.pagination?.totalPages);
    if (Number.isFinite(reported) && reported > 0) totalPages = reported;
    const list = extractList(body);
    const before = all.size;
    for (const ex of list) {
      const id = ex.id ?? ex.slug ?? ex.name;
      if (id != null) all.set(String(id), stripVideos(ex));
    }
    console.log(`   página ${page}/${totalPages}: +${all.size - before} (total ${all.size})`);
    if (list.length === 0) break;
  }

  let usage = null;
  try {
    usage = await get("/usage");
  } catch (e) {
    usage = { erro: e.message };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    geradoEm: new Date().toISOString(),
    total: all.size,
    extras,
    usage,
    // Estrutura da 1ª página (sem a lista) para entender a paginação da API.
    formatoPrimeiraPagina:
      firstPageRaw && typeof firstPageRaw === "object" && !Array.isArray(firstPageRaw)
        ? Object.fromEntries(
            Object.entries(firstPageRaw).map(([k, v]) => [k, Array.isArray(v) ? `[lista com ${v.length}]` : v])
          )
        : null,
    exercicios: [...all.values()]
  };
  const file = resolve(OUT_DIR, "ymove-catalogo.json");
  writeFileSync(file, JSON.stringify(out, null, 2), "utf-8");
  console.log(`\n✅ Pronto: ${all.size} exercícios salvos em ${file}`);
}

main().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});
