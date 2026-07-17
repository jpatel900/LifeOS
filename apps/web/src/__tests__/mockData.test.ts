import { describe, it, expect } from "vitest";
import { areas } from "@/lib/mockData";

describe("mockData", () => {
  it("includes the required seed areas", () => {
    expect(areas.map((area) => [area.id, area.name, area.color])).toEqual([
      ["area-main-job", "Main Job", "#4c80cd"],
      ["area-personal", "Personal", "#439458"],
      ["area-volunteer", "Volunteer Work", "#8965ba"],
      ["area-side-project", "Side Project", "#d87248"],
    ]);
  });
});
