/**
 * Script de recuperação de leads perdidos — v2
 * (06/05/2026 – 08/05/2026)
 *
 * Como rodar (na raiz do projeto):
 *   node scripts/recover-leads.mjs
 *
 * O script verifica o estado atual de cada lead no LeadLovers:
 *   • NÃO EXISTE  → cria via POST com sequência
 *   • EXISTE SEM SEQUÊNCIA (Level: null) → re-faz POST para matricular na sequência
 *   • JÁ MATRICULADO → pula (nada a fazer)
 *
 * Ao final exibe um relatório completo.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Carrega .env.local ───────────────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) {
        process.env[key.trim()] = rest.join("=").trim();
      }
    }
  } catch {
    console.log("⚠️  .env.local não encontrado — usando variáveis do sistema.");
  }
}

loadEnv();

// ─── Configuração ─────────────────────────────────────────────────────────────
const TOKEN         = process.env.LEADLOVERS_TOKEN?.trim();
const ENDPOINT      = "https://llapi.leadlovers.com/webapi/lead";
const MACHINE_CODE  = 774503;
const SEQUENCE_CODE = 1838006;   // Sequência Inicial
const LEVEL_CODE    = 1;
const DELAY_MS      = 1200;      // 1,2 s entre requisições

// ─── Lista de leads perdidos ──────────────────────────────────────────────────
const LEADS = [
  { name: "Lilian",                          email: "lili_an_mrs@hotmail.com" },
  { name: "Cynara",                          email: "cycy2006-bts@hotmail.com" },
  { name: "Tamires",                         email: "tamires.mbt@gmail.com" },
  { name: "Lorena",                          email: "soareslorena2387@gmail.com" },
  { name: "hiany",                           email: "hianybritto@gmail.com" },
  { name: "KAYKY",                           email: "kaykytelescr7@gmail.com" },
  { name: "Victor",                          email: "vitinho201920@gmail.com" },
  { name: "davi",                            email: "hokagedavi544@gmail.com" },
  { name: "anne",                            email: "babueanne@gmail.com" },
  { name: "gustav",                          email: "ruivaum1@gmail.com" },
  { name: "Angélica Pereira Ramos",          email: "agnelicapereira123@gmail.com" },
  { name: "Andrea",                          email: "andreia34144465@gmail.com" },
  { name: "Zahra",                           email: "meldelamari@gmail.comm" }, // typo — pode falhar
  { name: "Andreza",                         email: "andrezamarvila3@gmail.com" },
  { name: "maria fernanda",                  email: "soaresmariafernanda310@gmail.com" },
  { name: "Italo Matheus",                   email: "zedehelena2050@gmail.com" },
  { name: "Roger Magalhães",                 email: "rogermartinsrm02@gmail.com" },
  { name: "Brunna Bheatrys Almeida Lacerda", email: "brunna_bheatrys@hotmail.com" },
  { name: "Alexandrex845",                   email: "alexandrex845@gmail.com" },
  { name: "Edneura",                         email: "edneura8@gmail.com" },
  { name: "Luigi",                           email: "luigienzo694@gmail.com" },
  { name: "Julia Caroline",                  email: "juliafoxboreal@gmail.com" },
  { name: "Maria",                           email: "mariafernanda.ba@hotmail.com" },
  { name: "Larissa",                         email: "larissabrito0@icloud.com" },
  { name: "Kayra",                           email: "kayragoncalvesg@gmail.com" },
  { name: "Neida",                           email: "neidakamuraty58@gmail.com" },
  { name: "Rosangela Ludovico",              email: "rosangela.tha.285@gmail.com" },
  { name: "MARIA",                           email: "larisilvam79@gmail.com" },
  { name: "Vinicius",                        email: "viniciuseduardosouzabiagge@gmail.com" },
  { name: "cat",                             email: "scath7x@gmail.com" },
  { name: "Bianca Biasoli",                  email: "bibiasolibianca@gmail.com" },
  { name: "Amanda",                          email: "amandaanavit@gmail.com" },
  { name: "ANA RUTE AMORIM BENEVIDES",       email: "amorimanarute303@gmail.com" },
  { name: "ISABELA",                         email: "pinho.isabela21@gmail.com" },
  { name: "Bruna",                           email: "brunajmarques10@gmail.com" },
  { name: "Fernanda",                        email: "flinsneves@gmail.com" },
  { name: "Vitória cristine",                email: "vitoriacristineimob.gerente@gmail.com" },
  { name: "BRUNO",                           email: "valdemiroalvesdasilva67@gmail.com" },
  { name: "leonardo",                        email: "leogumiero13@gmail.com" },
  { name: "VANESSA",                         email: "vanessaoliver902@gmail.com" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildUrl(query = {}) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("token", TOKEN);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiRequest(method, payload, query) {
  try {
    const res = await fetch(buildUrl(query), {
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${TOKEN}`,
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, text, json };
  } catch (err) {
    return { ok: false, status: null, text: err.message, json: null };
  }
}

// Retorna o estado atual do lead:
//   "not_found"        → 404
//   "enrolled"         → existe e tem Level
//   "exists_no_level"  → existe mas Level é null/ausente
//   "error"            → outro erro
async function checkLead(email) {
  const r = await apiRequest("GET", null, { email });

  if (r.status === 404) return { state: "not_found", raw: r };
  if (!r.ok)            return { state: "error",     raw: r };

  // 200 OK — verifica se está em alguma sequência
  const level = r.json?.Level ?? r.json?.level ?? null;
  const seq   = r.json?.EmailSequenceCode ?? r.json?.emailSequenceCode ?? null;

  if (level !== null || seq !== null) {
    return { state: "enrolled", raw: r };
  }
  return { state: "exists_no_level", raw: r };
}

// Envia POST para criar/matricular o lead na sequência
async function enrollLead(lead) {
  return apiRequest("POST", {
    MachineCode:       MACHINE_CODE,
    EmailSequenceCode: SEQUENCE_CODE,
    SequenceLevelCode: LEVEL_CODE,
    Email:             lead.email,
    Name:              lead.name,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log("=".repeat(66));
  console.log("  RECUPERAÇÃO DE LEADS — v2 (com diagnóstico por lead)");
  console.log("=".repeat(66));

  if (!TOKEN) {
    console.error("\n❌ LEADLOVERS_TOKEN não encontrado no .env.local!");
    process.exit(1);
  }

  console.log(`\n✅ Token: ${TOKEN.length} chars | Máquina: ${MACHINE_CODE} | Seq: ${SEQUENCE_CODE} | Nível: ${LEVEL_CODE}`);
  console.log(`   Total de leads: ${LEADS.length}\n`);

  const results = {
    already_enrolled:  [],   // não precisou fazer nada
    created:           [],   // não existia, criado agora
    re_enrolled:       [],   // existia sem sequência, POST enviado
    failed:            [],   // erro na API
  };

  for (let i = 0; i < LEADS.length; i++) {
    const lead = LEADS[i];
    const idx  = String(i + 1).padStart(2, "0");
    const pad  = lead.email.padEnd(48);

    // Passo 1: verificar estado atual
    const check = await checkLead(lead.email);
    await wait(400);

    if (check.state === "enrolled") {
      console.log(`[${idx}] ⏭️  JÁ MATRICULADO  ${pad}`);
      results.already_enrolled.push(lead.email);
      continue;
    }

    // Passo 2: enviar POST para criar ou re-matricular
    const action = check.state === "exists_no_level" ? "RE-MATRICULAR" : "CRIAR";
    process.stdout.write(`[${idx}] 📤 ${action.padEnd(13)} ${pad} → `);

    const enroll = await enrollLead(lead);

    if (enroll.ok) {
      console.log(`✅ ${enroll.status}  ${enroll.text}`);
      if (check.state === "exists_no_level") {
        results.re_enrolled.push(lead.email);
      } else {
        results.created.push(lead.email);
      }
    } else {
      console.log(`❌ ${enroll.status ?? "ERR"}  ${enroll.text}`);
      results.failed.push({
        email: lead.email,
        state: check.state,
        status: enroll.status,
        body: enroll.text,
      });
    }

    if (i < LEADS.length - 1) await wait(DELAY_MS);
  }

  // ─── Relatório ─────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(66));
  console.log("  RELATÓRIO FINAL");
  console.log("=".repeat(66));
  console.log(`  ⏭️  Já estavam matriculados (ok): ${results.already_enrolled.length}`);
  console.log(`  ✅ Criados agora               : ${results.created.length}`);
  console.log(`  ✅ Re-matriculados             : ${results.re_enrolled.length}`);
  console.log(`  ❌ Falhas                      : ${results.failed.length}`);

  if (results.failed.length) {
    console.log("\n  Leads com falha:");
    for (const f of results.failed) {
      console.log(`    ✗ ${f.email}`);
      console.log(`      Estado no LL: ${f.state} | HTTP: ${f.status ?? "ERR"}`);
      console.log(`      Resposta    : ${f.body}`);
    }
  }

  const totalActioned = results.created.length + results.re_enrolled.length;
  console.log(`\n  Total enviados para a fila: ${totalActioned}`);
  console.log("  ℹ️  O LeadLovers processa de forma assíncrona — aguarde");
  console.log("     alguns minutos e verifique no painel LeadLovers.");
  console.log("=".repeat(66) + "\n");
}

run();
