import { USER_DATA_EXPORT_TABLES, type UserDataExport } from "./export";

export const LIFE_ARCHIVE_CONTRACT = "perimeter-contract.v1" as const;
export const LIFE_ARCHIVE_CONTRACT_VERSION = 1 as const;

export interface LifeArchiveFile {
  path: string;
  mediaType: "application/json" | "text/markdown";
  content: string;
}

export interface LifeArchiveBundle {
  contract: typeof LIFE_ARCHIVE_CONTRACT;
  files: LifeArchiveFile[];
}

type UnknownRecord = Record<string, unknown>;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonFile(path: string, value: unknown): LifeArchiveFile {
  return {
    path,
    mediaType: "application/json",
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function markdownFile(path: string, content: string): LifeArchiveFile {
  return {
    path,
    mediaType: "text/markdown",
    content: content.endsWith("\n") ? content : `${content}\n`,
  };
}

function safeSlug(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  const slug = normalized || "area";
  return WINDOWS_RESERVED_NAME.test(slug) ? `area-${slug}` : slug;
}

function allocateUniqueSlug(name: string, used: Set<string>) {
  const base = safeSlug(name);
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}

function displayLine(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function escapeMarkdownLinkLabel(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function validAreaRows(rows: unknown[]) {
  return rows.filter(
    (row): row is UnknownRecord =>
      isRecord(row) &&
      typeof row.name === "string" &&
      row.name.trim().length > 0,
  );
}

function renderArea(row: UnknownRecord) {
  const name = displayLine(row.name as string) || "Area";
  const lines = [`# ${name}`, ""];

  if (typeof row.is_active === "boolean") {
    lines.push(`Status: ${row.is_active ? "Active" : "Inactive"}`, "");
  }

  lines.push("## Description", "");
  if (typeof row.description === "string" && row.description.trim()) {
    lines.push(row.description, "");
  } else {
    lines.push("No description was provided.", "");
  }

  lines.push("## Charter", "");
  if (typeof row.charter_text === "string" && row.charter_text.trim()) {
    lines.push(row.charter_text, "");
  } else {
    lines.push("No charter has been written yet.", "");
  }

  return lines.join("\n");
}

function buildAreaFiles(rows: unknown[]) {
  const usedSlugs = new Set<string>();
  return validAreaRows(rows).map((row) => {
    const slug = allocateUniqueSlug(row.name as string, usedSlugs);
    return {
      name: displayLine(row.name as string) || "Area",
      file: markdownFile(`areas/${slug}.md`, renderArea(row)),
    };
  });
}

function validCompensationRules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (rule): rule is UnknownRecord =>
      isRecord(rule) &&
      typeof rule.trait === "string" &&
      rule.trait.trim().length > 0 &&
      typeof rule.rule === "string" &&
      rule.rule.trim().length > 0,
  );
}

function buildOperatorProfileFile(rows: unknown[]) {
  const profiles = rows.filter(isRecord);
  if (profiles.length === 0) return null;

  const lines = ["# Operator profile", ""];
  profiles.forEach((profile, index) => {
    if (profiles.length > 1) {
      lines.push(`## Profile ${index + 1}`, "");
    }

    if (
      typeof profile.profile_text === "string" &&
      profile.profile_text.trim()
    ) {
      lines.push(profile.profile_text, "");
    } else {
      lines.push("No operator profile text was provided.", "");
    }

    const rules = validCompensationRules(profile.compensation_rules);
    if (rules.length > 0) {
      lines.push("### Compensation rules", "");
      for (const rule of rules) {
        lines.push(`- **${rule.trait}:** ${rule.rule}`);
      }
      lines.push("");
    } else {
      lines.push("No compensation rules were provided.", "");
    }
  });

  return markdownFile("operator-profile.md", lines.join("\n"));
}

function buildReadme(
  input: UserDataExport,
  areas: ReturnType<typeof buildAreaFiles>,
  hasOperatorProfile: boolean,
) {
  const lines = [
    "# LifeOS export",
    "",
    "This portable archive contains the structured data and human-readable context exported from LifeOS.",
    "",
    `- Perimeter contract: \`${LIFE_ARCHIVE_CONTRACT}\``,
    `- Source format version: \`${input.format_version}\``,
    `- Exported at: \`${input.exported_at}\``,
    "",
    "## Areas",
    "",
  ];

  if (areas.length === 0) {
    lines.push("No areas were included in this export.", "");
  } else {
    for (const area of areas) {
      lines.push(
        `- [${escapeMarkdownLinkLabel(area.name)}](${area.file.path})`,
      );
    }
    lines.push("");
  }

  lines.push("## Structured tables", "");
  for (const table of USER_DATA_EXPORT_TABLES) {
    lines.push(`- [${table}](tables/${table}.json)`);
  }
  lines.push("");

  if (hasOperatorProfile) {
    lines.push(
      "## Operator profile",
      "",
      "- [Operator profile](operator-profile.md)",
      "",
    );
  }

  return markdownFile("README.md", lines.join("\n"));
}

/**
 * Transform an existing, user-scoped FR-016 export into the portable archive
 * perimeter contract. This pure function performs no I/O and does not mutate
 * its input.
 */
export function buildLifeArchive(input: UserDataExport): LifeArchiveBundle {
  const tableFiles = USER_DATA_EXPORT_TABLES.map((table) =>
    jsonFile(`tables/${table}.json`, input.tables[table]),
  );
  const areaEntries = buildAreaFiles(input.tables.areas);
  const areaFiles = areaEntries.map(({ file }) => file);
  const operatorProfileFile = buildOperatorProfileFile(
    input.tables.operator_profiles,
  );
  const derivedFiles = operatorProfileFile
    ? [...areaFiles, operatorProfileFile]
    : areaFiles;
  const readme = buildReadme(input, areaEntries, operatorProfileFile !== null);
  const indexedFiles = [readme, ...tableFiles, ...derivedFiles];
  const manifest = jsonFile("manifest.json", {
    perimeter_contract: LIFE_ARCHIVE_CONTRACT,
    contract_version: LIFE_ARCHIVE_CONTRACT_VERSION,
    source: {
      format_version: input.format_version,
      exported_at: input.exported_at,
    },
    files: [
      { path: "manifest.json", media_type: "application/json" },
      ...indexedFiles.map((file) => ({
        path: file.path,
        media_type: file.mediaType,
      })),
    ],
  });

  return {
    contract: LIFE_ARCHIVE_CONTRACT,
    files: [readme, manifest, ...tableFiles, ...derivedFiles],
  };
}
