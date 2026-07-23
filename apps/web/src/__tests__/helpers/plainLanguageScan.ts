import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { BANNED_ON_USER_SURFACE } from "./plainLanguageVocabulary";

/**
 * WHAT THIS SCANNER TREATS AS A "USER-FACING STRING"
 * ==================================================
 * A user-facing string is a literal in this repo's source whose text can be
 * rendered into the browser DOM for a person to read. There is no way to
 * decide that perfectly from source alone, so the scanner uses an explicit,
 * conservative approximation and states its limits rather than implying it
 * sees everything.
 *
 * IN (a string literal, template chunk, or JSX text is a candidate when):
 *   - it lives under one of `SCAN_ROOTS` (the code that produces the web UI),
 *   - it is prose-shaped: at least two whitespace-separated words containing a
 *     letter, OR it sits in a JSX text node / a copy-bearing JSX attribute
 *     (`aria-label`, `title`, `alt`, `placeholder`, `label`), where even a
 *     single word is copy.
 *
 * OUT (excluded by explicit, named mechanism — never by accident of path):
 *   1. Tests, test fixtures, and testing stubs. They are read by developers.
 *   2. Import/export module specifiers and `require()`/`import()` paths.
 *   3. Object-literal keys and `obj["..."]` index expressions — identifiers.
 *   4. String-literal *types* (`"healthy" | "critical"`) — identifiers.
 *   5. Arguments to `console.*` — developer log output, never rendered.
 *   6. Values of `DEVELOPER_LAYER_PROPERTIES` (see below) — the disclosure
 *      layer #724 built, where vendor and system words are the CORRECT words.
 *   7. Non-copy JSX attributes (`className`, `data-testid`, `href`, ...).
 *   8. Anything explicitly marked with the `DEVELOPER_LAYER_MARKER` comment.
 *
 * WHAT THIS SCANNER CANNOT SEE (stated so nobody mistakes it for total cover):
 *   - Strings composed at runtime: `` `Sign in before ${verb} in Supabase` ``
 *     is caught only if a banned term sits in a *literal* chunk. A term that
 *     arrives through an interpolated value is invisible.
 *   - Any value that comes from the database, an API response, an environment
 *     variable, or a third-party SDK's own error text.
 *   - Copy that is a single bare word in a `.ts` module (e.g. a lone
 *     `"Sentry"` used as a label) — the two-word prose rule skips it. Only
 *     JSX-positioned copy is checked below two words.
 *   - Copy living outside `SCAN_ROOTS`: e-mail templates, docs, the CLI
 *     package, and any string in `supabase/` SQL.
 *   - Whether a string that IS scanned actually reaches a screen. The scanner
 *     over-includes on purpose; over-inclusion costs a baseline entry, while
 *     under-inclusion would let real jargon ship.
 */

/** Roots that produce browser-rendered copy. */
const SCAN_ROOTS = ["apps/web/src", "packages/ui/src"] as const;

const IGNORED_SCAN_DIRECTORIES = new Set([
  ".next",
  ".turbo",
  ".vercel",
  "__tests__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "testing",
]);

/**
 * Field names whose string values are, by contract, developer-layer only.
 *
 * This is the EXPLICIT exemption hard-requirement 1 asks for. The developer
 * disclosure built in #724 (`data-testid="health-developer-details"`) is the
 * only place these render, and there the vendor and system words are the
 * CORRECT words. The #692 inventory's "Not a violation" list is this set.
 *
 * The exemption is keyed on the NAME OF THE FIELD the value flows into — an
 * object property (`{ subsystem: "supabase config" }`) or a named function
 * parameter (`makeCheck(id, subsystem, ...)`) — never on the file the value
 * happens to live in. So a brand-new user-facing string in `health.ts` is
 * still scanned, and moving these helpers to another file changes nothing.
 * Parameter names are resolved against declarations in the same file only;
 * a cross-file call is NOT exempted (see the blind-spot list above).
 */
export const DEVELOPER_LAYER_PROPERTIES = new Set([
  // HealthCheck.details — rendered verbatim inside the developer disclosure.
  "details",
  // Nested inside details; named separately so a flattened payload stays out.
  "repair_steps",
  // Persisted developer identifier for a check ("supabase config").
  "subsystem",
]);

/**
 * Escape hatch for a developer-layer string that no property name covers.
 * Put it in a comment immediately above the string's statement or expression.
 * Every use is a reviewable line in the diff.
 */
export const DEVELOPER_LAYER_MARKER = "plain-language-guard: developer-layer";

/** JSX attributes that carry copy a person reads. */
const COPY_JSX_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
]);

/** JSX attributes that never carry copy. Their values are skipped outright. */
const NON_COPY_JSX_ATTRIBUTES = new Set([
  "as",
  "className",
  "d",
  "data-testid",
  "fill",
  "href",
  "id",
  "key",
  "name",
  "rel",
  "role",
  "src",
  "stroke",
  "style",
  "target",
  "type",
  "value",
  "viewBox",
  "xmlns",
]);

export type ScannedString = {
  /** Repo-relative, forward-slash path. Stable across Windows and Linux. */
  file: string;
  line: number;
  text: string;
};

export type PlainLanguageViolation = ScannedString & {
  /** `String(regex)` of the banned term that matched. */
  term: string;
};

const repoRoot = resolve(__dirname, "../../../../..");

function walkFiles(relativePath: string): string[] {
  const currentPath = resolve(repoRoot, relativePath);

  // Sorted so the scan order — and therefore the reported violation order —
  // is identical on every machine and in CI.
  return readdirSync(currentPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const next = `${relativePath}/${entry.name}`.replace(/\\/g, "/");

      if (entry.isDirectory()) {
        return IGNORED_SCAN_DIRECTORIES.has(entry.name) ? [] : walkFiles(next);
      }

      return entry.isFile() ? [next] : [];
    });
}

function isScannedFile(path: string) {
  if (!/\.tsx?$/.test(path)) return false;
  if (/\.(test|spec)\.tsx?$/.test(path)) return false;
  if (/\.d\.ts$/.test(path)) return false;
  return true;
}

/** Line endings normalized so a baseline entry matches on Windows and Linux. */
function normalize(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

function hasDeveloperLayerMarker(node: ts.Node, sourceText: string) {
  const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());
  return (ranges ?? []).some((range) =>
    sourceText.slice(range.pos, range.end).includes(DEVELOPER_LAYER_MARKER),
  );
}

function isConsoleCall(node: ts.Node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "console"
  );
}

function jsxAttributeName(node: ts.JsxAttribute) {
  return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
}

/** True when this literal sits in a position that is an identifier, not copy. */
function isIdentifierPosition(node: ts.Node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isEnumMember(parent) ||
      ts.isMethodDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (
    ts.isElementAccessExpression(parent) &&
    parent.argumentExpression === node
  )
    return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
    return true;
  return false;
}

/**
 * Map every named function in the file to its parameter names, so a positional
 * argument can be matched to the field it lands in. Same-file only — this is a
 * text scan, not a type checker.
 */
function collectParameterNames(source: ts.SourceFile) {
  const byFunctionName = new Map<string, string[]>();

  const parameterNames = (fn: {
    parameters: ts.NodeArray<ts.ParameterDeclaration>;
  }) =>
    fn.parameters.map((parameter) =>
      ts.isIdentifier(parameter.name) ? parameter.name.text : "",
    );

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      byFunctionName.set(node.name.text, parameterNames(node));
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      byFunctionName.set(node.name.text, parameterNames(node.initializer));
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return byFunctionName;
}

function collectFromFile(file: string): ScannedString[] {
  const sourceText = readFileSync(resolve(repoRoot, file), "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const parameterNames = collectParameterNames(source);

  /** Argument positions in this call that land in a developer-layer field. */
  const developerLayerArguments = (node: ts.CallExpression) => {
    if (!ts.isIdentifier(node.expression)) return new Set<ts.Node>();
    const names = parameterNames.get(node.expression.text);
    if (!names) return new Set<ts.Node>();
    return new Set<ts.Node>(
      node.arguments.filter((_argument, index) =>
        DEVELOPER_LAYER_PROPERTIES.has(names[index] ?? ""),
      ),
    );
  };

  const exemptArguments = new Set<ts.Node>();

  const found: ScannedString[] = [];

  const record = (node: ts.Node, raw: string, fromCopyPosition: boolean) => {
    const text = normalize(raw);
    if (!/[a-z]/i.test(text)) return;
    if (!fromCopyPosition && text.split(/\s+/).length < 2) return;

    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push({ file, line: line + 1, text });
  };

  const visit = (node: ts.Node) => {
    // --- pruned subtrees: developer-only or identifier-only positions ---
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isImportTypeNode(node)) return;
    if (isConsoleCall(node)) return;
    if (exemptArguments.has(node)) return;
    if (ts.isCallExpression(node)) {
      for (const argument of developerLayerArguments(node)) {
        exemptArguments.add(argument);
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      DEVELOPER_LAYER_PROPERTIES.has(node.name.text)
    ) {
      return;
    }
    if (
      ts.isJsxAttribute(node) &&
      NON_COPY_JSX_ATTRIBUTES.has(jsxAttributeName(node))
    ) {
      return;
    }
    if (hasDeveloperLayerMarker(node, sourceText)) return;

    // --- candidates ---
    if (ts.isJsxText(node)) {
      record(node, node.text, true);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (!isIdentifierPosition(node)) {
        const inCopyAttribute =
          node.parent &&
          ts.isJsxAttribute(node.parent) &&
          COPY_JSX_ATTRIBUTES.has(jsxAttributeName(node.parent));
        record(node, node.text, Boolean(inCopyAttribute));
      }
    } else if (ts.isTemplateExpression(node)) {
      record(node.head, node.head.text, false);
      for (const span of node.templateSpans) {
        record(span.literal, span.literal.text, false);
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return found;
}

let cachedStrings: ScannedString[] | null = null;

/**
 * Every candidate user-facing string under `SCAN_ROOTS`, in a stable order.
 * The walk is sorted and paths are forward-slashed, so the result is identical
 * on Windows and on Linux CI — the ratchet below depends on that.
 */
export function collectUserFacingStrings(): ScannedString[] {
  cachedStrings ??= SCAN_ROOTS.flatMap((root) =>
    walkFiles(root).filter(isScannedFile).flatMap(collectFromFile),
  );
  return cachedStrings;
}

/** Every candidate string that matches banned vocabulary, in a stable order. */
export function findPlainLanguageViolations(): PlainLanguageViolation[] {
  return collectUserFacingStrings().flatMap((candidate) => {
    const term = BANNED_ON_USER_SURFACE.find((banned) =>
      banned.test(candidate.text),
    );
    return term ? [{ ...candidate, term: String(term) }] : [];
  });
}
