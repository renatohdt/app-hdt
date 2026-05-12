/**
 * Script de diagnóstico da integração LeadLovers
 *
 * Como rodar (na raiz do projeto):
 *   node scripts/test-leadlovers.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lê o .env.local manualmente
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
    console.log("⚠️  .env.local não encontrado — usando variáveis do ambiente do sistema.");
  }
}

loadEnv();

const TOKEN = process.env.LEADLOVERS_TOKEN?.trim();
const ENDPOINT = "https://llapi.leadlovers.com/webapi/lead";
const TEST_EMAIL = process.argv[2] || "testelead@teste.com";
const MACHINE_CODE = 774503;
const SEQUENCE_CODE = 1842153; // nova sequencia
const LEVEL_CODE = 1;

function buildUrl(query = {}) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("token", TOKEN);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function request(method, label, payload, query) {
  const url = buildUrl(query);
  console.log(`\n📡 ${label}`);
  console.log(`   Método : ${method}`);
  console.log(`   URL    : ${ENDPOINT}${query ? "?..." : ""}`);
  if (payload) console.log(`   Payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${TOKEN}`,
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });

    const text = await res.text().catch(() => "");
    console.log(`   Status : ${res.status} ${res.statusText}`);
    console.log(`   Resposta: ${text || "(vazia)"}`);
    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    console.log(`   ❌ Erro de rede: ${err.message}`);
    return { ok: false, status: null, body: null };
  }
}

// Emails de usuários reais que deveriam estar no LeadLovers (cadastraram via quiz)
const CHECK_EMAILS = [
  "amandaanavit@gmail.com",
  "bibiasolibianca@gmail.com",
  "viniciuseduardosouzabiagge@gmail.com",
  "larisilvam79@gmail.com",
  "amorimanarute303@gmail.com",
];

async function run() {
  console.log("=".repeat(60));
  console.log("  DIAGNÓSTICO LEADLOVERS");
  console.log("=".repeat(60));

  if (!TOKEN) {
    console.log("\n❌ LEADLOVERS_TOKEN não encontrado no .env.local!");
    process.exit(1);
  }

  console.log(`\n✅ Token encontrado (${TOKEN.length} caracteres)`);

  // TESTE 1 — Verificar usuários reais que deveriam estar no LeadLovers
  console.log("\n" + "=".repeat(60));
  console.log("  VERIFICANDO LEADS REAIS (cadastros de hoje/ontem)");
  console.log("=".repeat(60));

  let encontrados = 0;
  let naoEncontrados = 0;

  for (const email of CHECK_EMAILS) {
    const result = await request("GET", `Buscar: ${email}`, undefined, { email });
    if (result.ok) {
      encontrados++;
      console.log(`   ✅ ENCONTRADO no LeadLovers`);
    } else if (result.status === 404) {
      naoEncontrados++;
      console.log(`   ❌ NÃO encontrado (404)`);
    } else {
      console.log(`   ⚠️  Status inesperado: ${result.status}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  RESULTADO: ${encontrados} encontrados / ${naoEncontrados} ausentes`);

  if (naoEncontrados > 0) {
    console.log("\n  ❌ PROBLEMA CONFIRMADO: leads foram processados no app");
    console.log("     mas não chegaram ao LeadLovers.");
    console.log("     Possível causa: limite de contatos, fila travada");
    console.log("     ou rejeição silenciosa pelo LeadLovers.");
  } else {
    console.log("\n  ✅ Todos os leads estão no LeadLovers — integração OK.");
  }

  // TESTE 2 — Criar lead SEM sequência (só com máquina)
  const newEmail = process.argv[2] || TEST_EMAIL;

  console.log("\n" + "=".repeat(60));
  console.log("  TESTE A: Criar lead SEM EmailSequenceCode");
  console.log("=".repeat(60));

  const createSemSequencia = await request("POST", `Criar (sem sequência): ${newEmail}`, {
    MachineCode: MACHINE_CODE,
    Email: newEmail,
    Name: "Teste Sem Sequencia",
  });

  if (createSemSequencia.ok) {
    console.log("\n   Aguardando 5s...");
    await new Promise((r) => setTimeout(r, 5000));
    const lookup1 = await request("GET", `Buscar: ${newEmail}`, undefined, { email: newEmail });
    if (lookup1.ok) {
      console.log("\n  ✅ Contato criado sem sequência — o problema é no EmailSequenceCode!");
    } else {
      console.log("\n  ❌ Nem sem sequência aparece — problema mais profundo.");
    }
  }

  // TESTE 3 — Criar lead COM sequência (sem campos extras)
  console.log("\n" + "=".repeat(60));
  console.log("  TESTE B: Criar lead COM sequência (payload mínimo)");
  console.log("=".repeat(60));

  const email2 = newEmail.replace("@", "+seq@");
  const createComSequencia = await request("POST", `Criar (com sequência): ${email2}`, {
    MachineCode: MACHINE_CODE,
    EmailSequenceCode: SEQUENCE_CODE,
    SequenceLevelCode: LEVEL_CODE,
    Email: email2,
    Name: "Teste Com Sequencia",
  });

  if (createComSequencia.ok) {
    console.log("\n   Aguardando 5s...");
    await new Promise((r) => setTimeout(r, 5000));
    const lookup2 = await request("GET", `Buscar: ${email2}`, undefined, { email: email2 });
    if (lookup2.ok) {
      console.log("\n  ✅ Com sequência funciona — o problema eram os campos extras no payload!");
    } else {
      console.log("\n  ❌ Com sequência também não aparece — sequência 1838006 está bloqueando.");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  FIM DO DIAGNÓSTICO");
  console.log("=".repeat(60) + "\n");
}

run();
