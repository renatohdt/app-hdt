import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".html"]);
const IGNORED_DIRS = new Set([".git", ".next", "node_modules", "public\\pwa", "public/pwa"]);
const MOJIBAKE_PATTERNS = [
  { regex: /[\u00c3\u00c2\uFFFD]/g, message: "Possível mojibake ou caractere quebrado." },
  { regex: /\u00e2[\u0080-\u00bf]/g, message: "Aspas, travessão ou seta corrompidos." }
];

const UI_TEXT_PATTERNS = [
  { regex: /Nao foi possivel/g, message: 'Use "Não foi possível".' },
  { regex: /Sua sessao expirou/g, message: 'Use "Sua sessão expirou".' },
  { regex: /Digite um e-mail valido/g, message: 'Use "válido".' },
  { regex: /\bDefinicao\b/g, message: 'Use "Definição".' },
  { regex: /\bGenero\b/g, message: 'Use "Gênero".' },
  { regex: /\bFormulario\b/g, message: 'Use "Formulário".' }
];

function shouldScanFile(pathname) {
  return [...FILE_EXTENSIONS].some((extension) => pathname.endsWith(extension));
}

function shouldScanUiPatterns(pathname) {
  const normalized = pathname.replaceAll("\\", "/");
  return normalized.startsWith("app/") || normalized.startsWith("components/");
}

function walk(directory) {
  const results = [];

  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      results.push(...walk(fullPath));
      continue;
    }

    const relativePath = relative(ROOT, fullPath);
    if (shouldScanFile(relativePath)) {
      results.push(relativePath);
    }
  }

  return results;
}

const findings = [];

for (const filePath of walk(ROOT)) {
  const content = readFileSync(join(ROOT, filePath), "utf8");

  for (const pattern of MOJIBAKE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      findings.push(`${filePath}: ${pattern.message}`);
    }
  }

  if (!shouldScanUiPatterns(filePath)) {
    continue;
  }

  for (const pattern of UI_TEXT_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      findings.push(`${filePath}: ${pattern.message}`);
    }
  }
}

if (findings.length) {
  console.error("Text quality check failed:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Text quality check passed.");
