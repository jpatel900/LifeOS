import { describe, it, expect } from "vitest";
import { areas } from "@/lib/mockData";

describe("mockData", () => {
  it("includes the required seed areas", () => {
    expect(areas.map((area) => [area.id, area.name, area.color])).toEqual([
      ["area-main-job", "Main Job", "#2563eb"],
      ["area-personal", "Personal", "#16a34a"],
      ["area-volunteer", "Volunteer Work", "#9333ea"],
      ["area-side-project", "Side Project", "#f97316"],
    ]);
  });
});
