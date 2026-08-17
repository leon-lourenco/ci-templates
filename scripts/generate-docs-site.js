#!/usr/bin/env node
// Builds "The Data Structures Atlas" out of a data-structures-project-style repo: one gallery
// page listing every module with its icon, and one page per module rendering that module's own
// README (problem, solution+mermaid diagram, classic/applied examples, benchmark) plus an
// embedded view of its actual test source and a link to its JaCoCo report. Generates the whole
// site in English, Portuguese (pt-BR), and Spanish (es) - a module without a translated README
// yet falls back to the English one with a small notice, so the site never 404s on a language.
//
// Run from the repo root: node generate-docs-site.js <output-dir>
// Requires `marked` to already be installed (npm install marked) - not bundled here so this
// script has zero dependencies of its own to manage.

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const repoRoot = process.cwd();
const outDir = path.resolve(process.argv[2] || '_site');
const scriptDir = __dirname;
const iconsDir = path.join(scriptDir, 'icons');
const repoSlug = process.env.GITHUB_REPOSITORY || 'unknown/unknown';
const repoName = repoSlug.split('/')[1] || repoSlug;
const repoUrl = `https://github.com/${repoSlug}`;

const SITE_NAME = 'The Data Structures Atlas';
const AUTHOR_NAME = 'Leon Lourenço';
const AUTHOR_GITHUB = 'https://github.com/leon-lourenco';
const AUTHOR_LINKEDIN = 'https://www.linkedin.com/in/leonardo-lourenço-gomes';

const CATEGORY_ORDER = ['linear', 'trees', 'hashing', 'graphs'];
const LANGS = ['en', 'pt-BR', 'es'];
const LANG_LABELS = { en: 'English', 'pt-BR': 'Português', es: 'Español' };

const STRINGS = {
  en: {
    tagline: 'A field guide to classic data structures — click one to see how it actually works, not just what it\'s called.',
    subtitle: (n) => `${n} structures, each documented from its own real Gradle module — no content lives only on this page.`,
    allStructures: '← All structures',
    unitTests: 'Unit tests',
    viewCoverage: 'View full JaCoCo coverage report →',
    noTestSource: 'No test source found.',
    generatedBy: 'Generated automatically by',
    neverHandEditedModule: '— rendered straight from this module\'s own README, never hand-edited.',
    neverHandEditedIndex: '— never hand-edited.',
    viewSource: 'view source on GitHub',
    viewSourceRepo: 'View source on GitHub',
    builtBy: 'Built by',
    readIn: 'Read this in:',
    untranslated: 'This page hasn\'t been translated yet — showing the English version.',
    categories: { linear: 'Linear', trees: 'Trees', hashing: 'Hashing', graphs: 'Graphs' },
  },
  'pt-BR': {
    tagline: 'Um guia de campo para estruturas de dados clássicas — clique numa pra ver como ela funciona de verdade, não só como se chama.',
    subtitle: (n) => `${n} estruturas, cada uma documentada a partir do seu próprio módulo Gradle real — nenhum conteúdo vive só nesta página.`,
    allStructures: '← Todas as estruturas',
    unitTests: 'Testes unitários',
    viewCoverage: 'Ver relatório completo de cobertura JaCoCo →',
    noTestSource: 'Nenhum código de teste encontrado.',
    generatedBy: 'Gerado automaticamente por',
    neverHandEditedModule: '— renderizado direto do README deste módulo, nunca editado à mão.',
    neverHandEditedIndex: '— nunca editado à mão.',
    viewSource: 'ver código-fonte no GitHub',
    viewSourceRepo: 'Ver código-fonte no GitHub',
    builtBy: 'Construído por',
    readIn: 'Leia em:',
    untranslated: 'Esta página ainda não foi traduzida — mostrando a versão em inglês.',
    categories: { linear: 'Linear', trees: 'Árvores', hashing: 'Hashing', graphs: 'Grafos' },
  },
  es: {
    tagline: 'Una guía de campo para estructuras de datos clásicas — haz clic en una para ver cómo funciona realmente, no solo cómo se llama.',
    subtitle: (n) => `${n} estructuras, cada una documentada desde su propio módulo Gradle real — ningún contenido vive solo en esta página.`,
    allStructures: '← Todas las estructuras',
    unitTests: 'Pruebas unitarias',
    viewCoverage: 'Ver informe completo de cobertura JaCoCo →',
    noTestSource: 'No se encontró código de prueba.',
    generatedBy: 'Generado automáticamente por',
    neverHandEditedModule: '— renderizado directamente del README de este módulo, nunca editado a mano.',
    neverHandEditedIndex: '— nunca editado a mano.',
    viewSource: 'ver código fuente en GitHub',
    viewSourceRepo: 'Ver código fuente en GitHub',
    builtBy: 'Construido por',
    readIn: 'Leer en:',
    untranslated: 'Esta página aún no ha sido traducida — mostrando la versión en inglés.',
    categories: { linear: 'Linear', trees: 'Árboles', hashing: 'Hashing', graphs: 'Grafos' },
  },
};

function titleCase(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// The module's own English README H1 is the canonical display title (e.g. "AVL Tree",
// "B-Tree", "Graph: BFS & DFS") - the folder slug alone can't reproduce that casing/punctuation.
function extractTitle(moduleDir, moduleName) {
  const readme = readIfExists(path.join(moduleDir, 'README.md')) || '';
  const m = readme.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : titleCase(moduleName);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Finds every .java file under <moduleDir>/src/test/java whose path contains /<kind>/
// (classic or applied), sorted so output order is stable across runs.
function findTestFiles(moduleDir, kind) {
  const testRoot = path.join(moduleDir, 'src', 'test', 'java');
  if (!fs.existsSync(testRoot)) return [];
  const results = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.java') && full.split(path.sep).includes(kind)) {
        results.push(full);
      }
    }
  })(testRoot);
  return results.sort();
}

// --- path/link helpers for the 3-language site layout ---
// pageKey is 'index' for the gallery, or 'category/module' for a module page.

function outDirDepth(pageKey) {
  return pageKey === 'index' ? 0 : pageKey.split('/').length;
}

function outputRelPath(lang, pageKey) {
  const seg = pageKey === 'index' ? 'index.html' : `${pageKey}/index.html`;
  return lang === 'en' ? seg : `${lang}/${seg}`;
}

function depthFor(lang, pageKey) {
  return outDirDepth(pageKey) + (lang === 'en' ? 0 : 1);
}

function hrefTo(fromLang, fromPageKey, toLang, toPageKey) {
  const up = '../'.repeat(depthFor(fromLang, fromPageKey));
  return up + outputRelPath(toLang, toPageKey);
}

function assetHref(lang, pageKey, assetRelPath) {
  return '../'.repeat(depthFor(lang, pageKey)) + assetRelPath;
}

function langSwitcher(lang, pageKey, t) {
  const links = LANGS.map((l) => {
    const label = LANG_LABELS[l];
    if (l === lang) return `<strong>${label}</strong>`;
    return `<a href="${hrefTo(lang, pageKey, l, pageKey)}">${label}</a>`;
  }).join(' · ');
  return `<p class="lang-switch">${t.readIn} ${links}</p>`;
}

const PAGE_HEAD = (title, lang, pageKey) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lexend:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${assetHref(lang, pageKey, 'style.css')}">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  document.querySelectorAll('code.language-mermaid').forEach((el) => {
    const pre = document.createElement('pre');
    pre.className = 'mermaid';
    pre.textContent = el.textContent;
    el.parentElement.replaceWith(pre);
  });
  mermaid.initialize({ startOnLoad: true, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
  hljs.highlightAll();
</script>
</head>
<body>`;

function buildStyleCss() {
  return `:root {
  --bg: #ffffff; --fg: #16161f; --muted: #6b7280; --accent: #4f46e5; --accent-2: #06b6d4;
  --card-bg: #f8fafc; --card-border: #e2e8f0; --card-hover: #eef2ff; --code-bg: #f1f5f9;
  --hero-bg: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,70,229,0.12), transparent);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0c10; --fg: #e8e9ee; --muted: #9aa0ac; --accent: #818cf8; --accent-2: #22d3ee;
    --card-bg: #16171f; --card-border: #262834; --card-hover: #1d2030; --code-bg: #12131a;
    --hero-bg: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(129,140,248,0.15), transparent);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.65; -webkit-font-smoothing: antialiased; }
h1, h2, .brand { font-family: 'Lexend', 'Inter', sans-serif; }
header, main, footer { max-width: 880px; margin: 0 auto; }
header.hero { background: var(--hero-bg); padding: 3.5rem 1.5rem 2.5rem; max-width: none; }
header.hero > * { max-width: 880px; margin-left: auto; margin-right: auto; }
header.module { padding: 2.5rem 1.5rem 1.5rem; }
.brand { font-size: 2.1rem; font-weight: 800; margin: 0.6rem 0 0.6rem; letter-spacing: -0.01em; }
.brand .accent { background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tagline { color: var(--muted); font-size: 1.05rem; margin: 0 0 1rem; max-width: 640px; }
.subtitle { color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem; }
.byline { font-size: 0.9rem; color: var(--muted); margin: 0 0 1rem; }
.byline a { color: var(--fg); font-weight: 600; text-decoration: none; border-bottom: 1px solid var(--card-border); }
.byline a:hover { border-color: var(--accent); }
.repo-badge-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.repo-badge-row a { display: inline-flex; }
.lang-switch { font-size: 0.85rem; color: var(--muted); margin: 0.5rem 0 0; }
.lang-switch a { color: var(--muted); text-decoration: none; }
.lang-switch a:hover { color: var(--accent); text-decoration: underline; }
.lang-switch strong { color: var(--fg); }
.untranslated-notice { display: inline-block; margin: 0.75rem 0 0; padding: 0.4rem 0.8rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; font-size: 0.85rem; color: var(--muted); }
header.module h1 { font-size: 1.9rem; margin: 0.75rem 0 0.4rem; display: flex; align-items: center; gap: 0.75rem; }
.icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; border-radius: 12px; background: var(--card-bg); border: 1px solid var(--card-border); flex-shrink: 0; }
.icon-badge svg { width: 1.6rem; height: 1.6rem; color: var(--accent); }
header.module .back { color: var(--accent); text-decoration: none; font-size: 0.9rem; font-weight: 500; }
header.module .back:hover { text-decoration: underline; }
header.module .meta { color: var(--muted); font-size: 0.95rem; margin: 0; }
header.module .meta a { color: var(--muted); }
a { color: var(--accent); }
main { padding: 0 1.5rem 3rem; }
main h2 { margin-top: 2.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--card-border); font-size: 1.3rem; }
main table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
main th, main td { border: 1px solid var(--card-border); padding: 0.55rem 0.8rem; text-align: left; }
main th { background: var(--card-bg); font-weight: 600; }
main code { background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
main pre { background: var(--code-bg); padding: 1rem; border-radius: 10px; overflow-x: auto; }
main pre code { background: none; padding: 0; }
main pre.mermaid { background: var(--card-bg); border: 1px solid var(--card-border); text-align: center; padding: 1.5rem; }
main blockquote { border-left: 3px solid var(--accent); margin: 0; padding: 0.1rem 1rem; color: var(--muted); }
section { margin-bottom: 2.5rem; }
section.gallery-section h2 { margin-top: 2rem; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; border: none; padding-bottom: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.85rem; margin-top: 0.75rem; }
.card { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 1.5rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; color: var(--fg); text-decoration: none; font-weight: 600; font-size: 0.95rem; text-align: center; transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease; }
.card:hover { background: var(--card-hover); border-color: var(--accent); transform: translateY(-3px); }
.card .icon-badge { width: 3.25rem; height: 3.25rem; }
.card .icon-badge svg { width: 1.9rem; height: 1.9rem; }
.jacoco-link { display: inline-block; margin-top: 0.5rem; padding: 0.65rem 1.2rem; background: linear-gradient(90deg, var(--accent), var(--accent-2)); color: white; border-radius: 8px; text-decoration: none; font-weight: 600; }
.jacoco-link:hover { opacity: 0.9; }
.test-file { margin: 1.5rem 0; }
.test-file summary { cursor: pointer; font-weight: 600; padding: 0.5rem 0; }
footer { padding: 2rem 1.5rem; color: var(--muted); font-size: 0.85rem; text-align: center; border-top: 1px solid var(--card-border); margin-top: 2rem; }
footer a { color: var(--muted); }
footer p { margin: 0.35rem 0; }
`;
}

function readmeCandidates(moduleDir, lang) {
  const file = lang === 'en' ? 'README.md' : `README.${lang}.md`;
  const p = path.join(moduleDir, file);
  if (fs.existsSync(p)) return { text: fs.readFileSync(p, 'utf8'), fallback: false };
  const enPath = path.join(moduleDir, 'README.md');
  return { text: readIfExists(enPath) || '', fallback: lang !== 'en' };
}

function buildModulePage(lang, category, moduleName, moduleDir, title) {
  const t = STRINGS[lang];
  const pageKey = `${category}/${moduleName}`;
  const { text: readme, fallback } = readmeCandidates(moduleDir, lang);
  const bodyHtml = marked.parse(readme.replace(/^#[^\n]*\n/, '')); // strip the leading H1, header already shows the title

  const icon = readIfExists(path.join(iconsDir, `${moduleName}.svg`)) || '';

  const classicTests = findTestFiles(moduleDir, 'classic');
  const appliedTests = findTestFiles(moduleDir, 'applied');
  const testSections = [...classicTests, ...appliedTests].map((f) => {
    const rel = path.relative(moduleDir, f).split(path.sep).join('/');
    const code = readIfExists(f) || '';
    return `<details class="test-file" open>
<summary>${escapeHtml(rel)}</summary>
<pre><code class="language-java">${escapeHtml(code)}</code></pre>
</details>`;
  }).join('\n');

  return `${PAGE_HEAD(`${title} — ${SITE_NAME}`, lang, pageKey)}
<header class="module">
<a class="back" href="${hrefTo(lang, pageKey, lang, 'index')}">${t.allStructures}</a>
<h1><span class="icon-badge">${icon}</span>${escapeHtml(title)}</h1>
<p class="meta">${t.categories[category]} · <a href="${repoUrl}/tree/master/${category}/${moduleName}">${t.viewSource}</a></p>
${langSwitcher(lang, pageKey, t)}
${fallback ? `<span class="untranslated-notice">${t.untranslated}</span>` : ''}
</header>
<main>
${bodyHtml}
<h2>${t.unitTests}</h2>
${testSections || `<p>${t.noTestSource}</p>`}
<p><a class="jacoco-link" href="coverage/index.html">${t.viewCoverage}</a></p>
</main>
<footer>
<p>${t.generatedBy} <a href="${repoUrl}/actions">GitHub Actions</a> ${t.neverHandEditedModule}</p>
<p>${t.builtBy} <a href="${AUTHOR_GITHUB}">${AUTHOR_NAME}</a> · <a href="${AUTHOR_GITHUB}">GitHub</a> · <a href="${AUTHOR_LINKEDIN}">LinkedIn</a></p>
</footer>
</body></html>`;
}

function buildIndexPage(lang, modulesByCategory, total) {
  const t = STRINGS[lang];
  const sections = CATEGORY_ORDER.filter(c => modulesByCategory[c] && modulesByCategory[c].length).map((category) => {
    const cards = modulesByCategory[category].map(({ name, title }) => {
      const icon = readIfExists(path.join(iconsDir, `${name}.svg`)) || '';
      return `<a class="card" href="${category}/${name}/index.html"><span class="icon-badge">${icon}</span><span>${escapeHtml(title)}</span></a>`;
    }).join('\n');
    return `<section class="gallery-section"><h2>${t.categories[category]}</h2><div class="grid">${cards}</div></section>`;
  }).join('\n');

  return `${PAGE_HEAD(SITE_NAME, lang, 'index')}
<header class="hero">
<div class="repo-badge-row">
<a href="${repoUrl}/actions/workflows/ci.yml"><img src="${repoUrl}/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
</div>
<h1 class="brand"><span class="accent">${SITE_NAME}</span></h1>
<p class="tagline">${t.tagline}</p>
<p class="subtitle">${t.subtitle(total)}</p>
<p class="byline">${t.builtBy} <a href="${AUTHOR_GITHUB}">${AUTHOR_NAME}</a> · <a href="${AUTHOR_GITHUB}">GitHub</a> · <a href="${AUTHOR_LINKEDIN}">LinkedIn</a> · <a href="${repoUrl}">${t.viewSourceRepo}</a></p>
${langSwitcher(lang, 'index', t)}
</header>
<main>
${sections}
</main>
<footer>
<p>${t.generatedBy} <a href="${repoUrl}/actions">GitHub Actions</a> ${t.neverHandEditedIndex}</p>
<p>${t.builtBy} <a href="${AUTHOR_GITHUB}">${AUTHOR_NAME}</a> · <a href="${AUTHOR_GITHUB}">GitHub</a> · <a href="${AUTHOR_LINKEDIN}">LinkedIn</a></p>
</footer>
</body></html>`;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// --- main ---
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'style.css'), buildStyleCss());

const modulesByCategory = {};
for (const category of CATEGORY_ORDER) {
  const categoryDir = path.join(repoRoot, category);
  if (!fs.existsSync(categoryDir)) continue;
  const moduleNames = fs.readdirSync(categoryDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();

  modulesByCategory[category] = [];
  for (const moduleName of moduleNames) {
    const moduleDir = path.join(categoryDir, moduleName);
    const jacocoReport = path.join(moduleDir, 'build', 'reports', 'jacoco', 'test', 'html');
    if (!fs.existsSync(jacocoReport)) continue; // module wasn't built (no tests ran) - skip it
    modulesByCategory[category].push({ name: moduleName, moduleDir, jacocoReport, title: extractTitle(moduleDir, moduleName) });
  }
}

const total = Object.values(modulesByCategory).reduce((n, arr) => n + arr.length, 0);

for (const lang of LANGS) {
  const langRoot = lang === 'en' ? outDir : path.join(outDir, lang);
  fs.mkdirSync(langRoot, { recursive: true });
  fs.writeFileSync(path.join(langRoot, 'index.html'), buildIndexPage(lang, modulesByCategory, total));
  for (const category of CATEGORY_ORDER) {
    for (const { name, moduleDir, jacocoReport, title } of modulesByCategory[category] || []) {
      const destDir = path.join(langRoot, category, name);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, 'index.html'), buildModulePage(lang, category, name, moduleDir, title));
      copyDir(jacocoReport, path.join(destDir, 'coverage'));
    }
  }
}

console.log(`Generated ${SITE_NAME}: ${total} module pages x ${LANGS.length} languages across ${Object.keys(modulesByCategory).length} categories -> ${outDir}`);
