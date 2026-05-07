import { describe, it, expect } from "vitest";
import { areas } from "@/lib/mockData";

describe("mockData", () => {
  it("includes the required seed areas", () => {
    const names = areas.map((a) => a.name);
    expect(names).toContain("Main Job");
    expect(names).toContain("Personal");
    expect(names).toContain("Volunteer Work");
  });
});

