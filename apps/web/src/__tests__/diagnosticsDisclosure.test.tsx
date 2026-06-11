import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiagnosticsDisclosure } from "../app/components/DiagnosticsDisclosure";

describe("DiagnosticsDisclosure", () => {
  it("defaults to system details", () => {
    render(
      <DiagnosticsDisclosure open>
        <p>System recovery detail</p>
      </DiagnosticsDisclosure>,
    );

    const disclosure = screen.getByText("System details").closest("details");

    expect(disclosure).toHaveAttribute("data-detail-level", "system");
    expect(screen.getByText("System recovery detail")).toBeDefined();
  });

  it("supports explicit developer details", () => {
    render(
      <DiagnosticsDisclosure detailLevel="developer" open>
        <p>Internal id</p>
      </DiagnosticsDisclosure>,
    );

    const disclosure = screen.getByText("Developer details").closest("details");

    expect(disclosure).toHaveAttribute("data-detail-level", "developer");
    expect(screen.getByText("Internal id")).toBeDefined();
  });
});
