#!/usr/bin/env node
// Generates a static projection of docs/coherence-registry.json.
// The map has no second data source and no hand-maintained content: regenerate
// it from the registry, do not edit the generated HTML by hand.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "docs", "coherence-registry.json");
const DEFAULT_OUT = path.join(REPO_ROOT, "coherence-map.html");

function parseOutPath(argv) {
  const outIndex = argv.indexOf("--out");
  if (outIndex === -1) return DEFAULT_OUT;
  const value = argv[outIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--out requires a file path");
  }
  return path.resolve(process.cwd(), value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupName(feature) {
  if (typeof feature.lane === "string" && feature.lane.trim()) {
    return `Lane: ${feature.lane.trim()}`;
  }
  if (typeof feature.plan === "string" && feature.plan.trim()) {
    return `Plan: ${feature.plan.trim()}`;
  }
  const surfaces = Array.isArray(feature.surfaces) ? feature.surfaces : [];
  const firstSurface = surfaces.find(
    (surface) => typeof surface === "string" && surface.trim(),
  );
  return firstSurface ? `Surface: ${firstSurface}` : "Unlaned / unplanned";
}

function readRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function collectModel(registry) {
  const features = Array.isArray(registry?.features) ? registry.features : [];
  const featureByFr = new Map(features.map((feature) => [feature.fr, feature]));
  const unresolvedFrs = new Set();
  const edges = [];

  for (const feature of features) {
    const interactions = Array.isArray(feature.interacts_with)
      ? feature.interacts_with
      : [];
    for (const edge of interactions) {
      edges.push({ from: feature, to: featureByFr.get(edge.fr), edge });
      if (
        edge.kind === "X" &&
        (typeof edge.resolution_ref !== "string" ||
          edge.resolution_ref.trim() === "")
      ) {
        unresolvedFrs.add(feature.fr);
        unresolvedFrs.add(edge.fr);
      }
    }
  }

  const groups = new Map();
  for (const feature of features) {
    const name = groupName(feature);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(feature);
  }

  return { features, groups, edges, unresolvedFrs };
}

function featureLabel(feature) {
  return `${feature?.fr ?? "unknown-fr"} ${feature?.title ?? "Untitled"}`;
}

function renderFeature(feature, unresolvedFrs) {
  const unresolved = unresolvedFrs.has(feature.fr);
  const surfaces =
    Array.isArray(feature.surfaces) && feature.surfaces.length > 0
      ? feature.surfaces.join(", ")
      : "No surfaces listed";
  return `<article class="node${unresolved ? " unresolved" : ""}" id="${escapeHtml(feature.fr)}">
    <h3>${escapeHtml(feature.fr)} <span>${escapeHtml(feature.title)}</span></h3>
    <p>${escapeHtml(surfaces)}</p>
    ${unresolved ? '<strong class="risk">unresolved conflict</strong>' : ""}
  </article>`;
}

function renderEdge({ from, to, edge }) {
  const kind = ["C", "S", "X"].includes(edge.kind) ? edge.kind : "unknown";
  const resolution = edge.resolution_ref
    ? ` Resolution: ${edge.resolution_ref}`
    : "";
  const target = to ?? { fr: edge.fr, title: "Unknown feature" };
  return `<li class="edge edge-${escapeHtml(kind)}">
    <span class="badge">${escapeHtml(kind)}</span>
    <strong>${escapeHtml(featureLabel(from))}</strong>
    <span aria-hidden="true">→</span>
    <strong>${escapeHtml(featureLabel(target))}</strong>
    ${edge.note ? `<p>${escapeHtml(edge.note)}</p>` : ""}
    ${resolution ? `<p>${escapeHtml(resolution)}</p>` : ""}
  </li>`;
}

function renderHtml(registry) {
  const model = collectModel(registry);
  const generatedAt = new Date().toISOString();
  const groups = [...model.groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, features]) => `<section class="group">
        <h2>${escapeHtml(name)}</h2>
        <div class="nodes">${features.map((feature) => renderFeature(feature, model.unresolvedFrs)).join("\n")}</div>
      </section>`,
    )
    .join("\n");
  const edges = model.edges.map(renderEdge).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LifeOS coherence map</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 2rem; }
    .meta, footer { color: #475569; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 18px 0; }
    .legend span, .badge { border-radius: 999px; color: white; display: inline-flex; font-weight: 700; padding: 4px 10px; }
    .kind-C, .edge-C .badge { background: #2563eb; }
    .kind-S, .edge-S .badge { background: #16a34a; }
    .kind-X, .edge-X .badge { background: #dc2626; }
    .group { background: white; border: 1px solid #e2e8f0; border-radius: 18px; margin: 18px 0; padding: 20px; }
    .nodes { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .node { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; }
    .node h3 { margin: 0 0 8px; }
    .node h3 span { display: block; font-size: .95rem; font-weight: 500; margin-top: 3px; }
    .node p, .edge p { margin: 6px 0 0; color: #475569; }
    .node.unresolved { border-color: #dc2626; box-shadow: 0 0 0 3px #fecaca; }
    .risk { color: #b91c1c; display: block; margin-top: 8px; }
    .edges { list-style: none; padding: 0; }
    .edge { background: white; border-left: 6px solid #94a3b8; border-radius: 12px; margin: 10px 0; padding: 12px; }
    .edge-C { border-left-color: #2563eb; }
    .edge-S { border-left-color: #16a34a; }
    .edge-X { border-left-color: #dc2626; }
    footer { border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 16px; }
    @media (prefers-color-scheme: dark) {
      body { background: #020617; color: #e2e8f0; }
      .group, .edge { background: #0f172a; border-color: #334155; }
      .node { border-color: #475569; }
      .meta, footer, .node p, .edge p { color: #94a3b8; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>LifeOS coherence map</h1>
      <p class="meta">${model.features.length} features · ${model.edges.length} edges · generated ${escapeHtml(generatedAt)}</p>
      <div class="legend" aria-label="Edge legend">
        <span class="kind-C">C compatible</span>
        <span class="kind-S">S synergy</span>
        <span class="kind-X">X conflict / state-risk red</span>
      </div>
    </header>
    ${groups}
    <section>
      <h2>Interactions</h2>
      <ul class="edges">${edges}</ul>
    </section>
    <footer>Generated from docs/coherence-registry.json — never hand-edit</footer>
  </main>
</body>
</html>
`;
}

function main() {
  const outPath = parseOutPath(process.argv.slice(2));
  const html = renderHtml(readRegistry());
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  console.log(`wrote ${path.relative(REPO_ROOT, outPath) || outPath}`);
}

main();
