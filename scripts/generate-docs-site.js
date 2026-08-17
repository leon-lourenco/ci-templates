#!/usr/bin/env node
// Builds a documentation site out of a data-structures-project-style repo: one gallery page
// listing every module with its icon, and one page per module rendering that module's own
// README.md (problem, solution+mermaid diagram, classic/applied examples, benchmark) plus an
// embedded view of its actual test source and a link to its JaCoCo report.
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

const CATEGORY_ORDER = ['linear', 'trees', 'hashing', 'graphs'];

function titleCase(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
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

const PAGE_HEAD = (title, depth = 0) => { const up = '../'.repeat(depth); return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${up}style.css">
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
<body>`; };

function buildStyleCss() {
  return `:root {
  --bg: #ffffff; --fg: #1a1a2e; --muted: #6b7280; --accent: #2563eb;
  --card-bg: #f8fafc; --card-border: #e2e8f0; --card-hover: #eef2ff; --code-bg: #f1f5f9;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1117; --fg: #e5e7eb; --muted: #9ca3af; --accent: #60a5fa;
    --card-bg: #1a1d27; --card-border: #2d313d; --card-hover: #232838; --code-bg: #161922;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; }
header, main, footer { max-width: 880px; margin: 0 auto; }
header { padding: 3rem 1.5rem 2rem; }
header h1 { font-size: 1.75rem; margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.75rem; }
header h1 svg { width: 2rem; height: 2rem; flex-shrink: 0; }
header p { color: var(--muted); margin: 0; }
header a.back { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
header a.back:hover { text-decoration: underline; }
a { color: var(--accent); }
main { padding: 0 1.5rem 3rem; }
main h2 { margin-top: 2.5rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.5rem; }
main table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
main th, main td { border: 1px solid var(--card-border); padding: 0.5rem 0.75rem; text-align: left; }
main th { background: var(--card-bg); }
main code { background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
main pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
main pre code { background: none; padding: 0; }
main pre.mermaid { background: var(--card-bg); text-align: center; }
main blockquote { border-left: 3px solid var(--accent); margin: 0; padding: 0.1rem 1rem; color: var(--muted); }
section { margin-bottom: 2.5rem; }
section.gallery-section h2 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--card-border); border-top: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.9rem; }
.card { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.25rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; color: var(--fg); text-decoration: none; font-weight: 500; text-align: center; transition: background 0.15s ease, transform 0.15s ease; }
.card:hover { background: var(--card-hover); transform: translateY(-2px); }
.card svg { width: 2.75rem; height: 2.75rem; color: var(--accent); }
.jacoco-link { display: inline-block; margin-top: 0.5rem; padding: 0.6rem 1.1rem; background: var(--accent); color: white; border-radius: 8px; text-decoration: none; font-weight: 600; }
.jacoco-link:hover { opacity: 0.9; }
.test-file { margin: 1.5rem 0; }
.test-file summary { cursor: pointer; font-weight: 600; padding: 0.5rem 0; }
footer { padding: 1.5rem; color: var(--muted); font-size: 0.85rem; text-align: center; }
footer a { color: var(--muted); }
`;
}

function buildModulePage(category, moduleName, moduleDir) {
  const readme = readIfExists(path.join(moduleDir, 'README.md')) || `# ${titleCase(moduleName)}\n\nNo README yet.`;
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

  const jacocoRel = 'coverage/index.html';

  return `${PAGE_HEAD(`${titleCase(moduleName)} — ${repoName}`, 2)}
<header>
<a class="back" href="../../index.html">← All structures</a>
<h1>${icon}${titleCase(moduleName)}</h1>
<p>${titleCase(category)} · <a href="${repoUrl}/tree/master/${category}/${moduleName}">view source on GitHub</a></p>
</header>
<main>
${bodyHtml}
<h2>Unit tests</h2>
${testSections || '<p>No test source found.</p>'}
<p><a class="jacoco-link" href="${jacocoRel}">View full JaCoCo coverage report →</a></p>
</main>
<footer><p>Generated automatically by <a href="${repoUrl}/actions">GitHub Actions</a> from this module's own README — never hand-edited.</p></footer>
</body></html>`;
}

function buildIndexPage(modulesByCategory) {
  const sections = CATEGORY_ORDER.filter(c => modulesByCategory[c] && modulesByCategory[c].length).map((category) => {
    const cards = modulesByCategory[category].map(({ name }) => {
      const icon = readIfExists(path.join(iconsDir, `${name}.svg`)) || '';
      return `<a class="card" href="${category}/${name}/index.html">${icon}<span>${titleCase(name)}</span></a>`;
    }).join('\n');
    return `<section class="gallery-section"><h2>${titleCase(category)}</h2><div class="grid">${cards}</div></section>`;
  }).join('\n');

  return `${PAGE_HEAD(repoName)}
<header>
<h1>${repoName}</h1>
<p>Click a structure to read its problem/solution writeup, both examples, and its test coverage. <a href="${repoUrl}">View source on GitHub →</a></p>
</header>
<main>
${sections}
</main>
<footer><p>Generated automatically by <a href="${repoUrl}/actions">GitHub Actions</a> — never hand-edited.</p></footer>
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

    const destDir = path.join(outDir, category, moduleName);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'index.html'), buildModulePage(category, moduleName, moduleDir));
    copyDir(jacocoReport, path.join(destDir, 'coverage'));

    modulesByCategory[category].push({ name: moduleName });
  }
}

fs.writeFileSync(path.join(outDir, 'index.html'), buildIndexPage(modulesByCategory));

const total = Object.values(modulesByCategory).reduce((n, arr) => n + arr.length, 0);
console.log(`Generated docs site: ${total} module pages across ${Object.keys(modulesByCategory).length} categories -> ${outDir}`);
