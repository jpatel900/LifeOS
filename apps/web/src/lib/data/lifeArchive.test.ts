import { describe, expect, it } from "vitest";
import { USER_DATA_EXPORT_TABLES, type UserDataExport } from "./export";
import {
  LIFE_ARCHIVE_CONTRACT,
  buildLifeArchive,
  type LifeArchiveFile,
} from "./lifeArchive";

function exportWith(
  tables: Partial<UserDataExport["tables"]> = {},
): UserDataExport {
  return {
    format_version: 1,
    exported_at: "2026-07-14T04:00:00.000Z",
    tables: Object.fromEntries(
      USER_DATA_EXPORT_TABLES.map((table) => [table, tables[table] ?? []]),
    ) as UserDataExport["tables"],
  };
}

function fileAt(files: LifeArchiveFile[], path: string) {
  const file = files.find((candidate) => candidate.path === path);
  expect(file, `missing ${path}`).toBeDefined();
  return file!;
}

describe("buildLifeArchive", () => {
  it("retains every export table exactly once and excludes token material", () => {
    const input = exportWith({
      areas: [{ id: "area-1", name: "Home" }, null, "malformed"],
      tasks: [{ id: "task-1", title: "Prepare" }],
    });

    const archive = buildLifeArchive(input);
    const tablePaths = archive.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("tables/"));

    expect(archive.contract).toBe(LIFE_ARCHIVE_CONTRACT);
    expect(tablePaths).toEqual(
      USER_DATA_EXPORT_TABLES.map((table) => `tables/${table}.json`),
    );
    expect(new Set(tablePaths).size).toBe(USER_DATA_EXPORT_TABLES.length);
    expect(
      archive.files.some((file) =>
        file.path.includes("google_calendar_connections"),
      ),
    ).toBe(false);
    expect(
      JSON.parse(fileAt(archive.files, "tables/areas.json").content),
    ).toEqual(input.tables.areas);
    expect(
      JSON.parse(fileAt(archive.files, "tables/tasks.json").content),
    ).toEqual(input.tables.tasks);
  });

  it("writes a versioned manifest and a root index for an empty export", () => {
    const input = exportWith();
    const archive = buildLifeArchive(input);
    const manifest = JSON.parse(
      fileAt(archive.files, "manifest.json").content,
    ) as Record<string, unknown>;
    const readme = fileAt(archive.files, "README.md").content;

    expect(manifest).toMatchObject({
      perimeter_contract: "perimeter-contract.v1",
      contract_version: 1,
      source: {
        format_version: input.format_version,
        exported_at: input.exported_at,
      },
    });
    expect(readme).toContain("# LifeOS export");
    expect(readme).toContain("No areas were included in this export.");
    expect(
      archive.files.filter((file) => file.path.startsWith("areas/")),
    ).toEqual([]);
    expect(
      archive.files.some((file) => file.path === "operator-profile.md"),
    ).toBe(false);
  });

  it("renders valid areas with exact charter text and calm empty states", () => {
    const charter = "Protect mornings.\n\nPrefer one meaningful finish.";
    const archive = buildLifeArchive(
      exportWith({
        areas: [
          {
            id: "area-work",
            name: "Main Work",
            description: "The work that matters now.",
            is_active: true,
            charter_text: charter,
          },
          {
            id: "area-home",
            name: "Home",
            description: null,
            is_active: false,
            charter_text: "",
          },
          null,
          { name: 42, charter_text: "must not render" },
        ],
      }),
    );
    const areaFiles = archive.files.filter((file) =>
      file.path.startsWith("areas/"),
    );

    expect(areaFiles).toHaveLength(2);
    expect(areaFiles[0]?.content).toContain("# Main Work");
    expect(areaFiles[0]?.content).toContain("Status: Active");
    expect(areaFiles[0]?.content).toContain("The work that matters now.");
    expect(areaFiles[0]?.content).toContain(charter);
    expect(areaFiles[1]?.content).toContain("Status: Inactive");
    expect(areaFiles[1]?.content).toContain("No description was provided.");
    expect(areaFiles[1]?.content).toContain("No charter has been written yet.");
    expect(fileAt(archive.files, "README.md").content).toContain(
      `[Main Work](${areaFiles[0]?.path})`,
    );
  });

  it("escapes adversarial area names in README link labels", () => {
    const archive = buildLifeArchive(
      exportWith({ areas: [{ name: String.raw`Area \ [draft]` }] }),
    );
    const readme = fileAt(archive.files, "README.md").content;

    expect(readme).toContain(
      String.raw`- [Area \\ \[draft\]](areas/area-draft.md)`,
    );
    expect(readme).not.toContain(String.raw`- [Area \ [draft]](`);
  });

  it("renders valid operator profile rows without crashing on malformed rows", () => {
    const operatorProfiles = [
      false,
      {
        profile_text: "Strong at synthesis; slow to start.",
        compensation_rules: [
          { trait: "Starting friction", rule: "Name the first move." },
          { trait: 7, rule: "omitted" },
        ],
      },
    ];
    const archive = buildLifeArchive(
      exportWith({ operator_profiles: operatorProfiles }),
    );
    const profile = fileAt(archive.files, "operator-profile.md").content;

    expect(profile).toContain("# Operator profile");
    expect(profile).toContain("Strong at synthesis; slow to start.");
    expect(profile).toContain("**Starting friction:** Name the first move.");
    expect(
      JSON.parse(
        fileAt(archive.files, "tables/operator_profiles.json").content,
      ),
    ).toEqual(operatorProfiles);
  });

  it("makes duplicate and malicious area names unique and Windows-safe", () => {
    const archive = buildLifeArchive(
      exportWith({
        areas: [
          { name: "../CON" },
          { name: "..\\con" },
          { name: "Project: Alpha?" },
          { name: "Project: Alpha?" },
          { name: '\u0000<>:"/\\|?*' },
        ],
      }),
    );
    const paths = archive.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("areas/"));
    const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

    expect(paths).toHaveLength(5);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path).toMatch(/^areas\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/);
      expect(path).not.toContain("..");
      expect(path).not.toMatch(/[\u0000-\u001f<>:\"\\|?*]/);
      expect(path.startsWith("/")).toBe(false);
      expect(windowsReserved.test(path.slice("areas/".length))).toBe(false);
    }
  });

  it("is byte-deterministic and does not mutate its input", () => {
    const input = exportWith({
      areas: [{ name: "Health", charter_text: "Move every day." }],
      tasks: [{ title: "Walk" }],
    });
    const before = JSON.stringify(input);

    const first = buildLifeArchive(input);
    const second = buildLifeArchive(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });
});
