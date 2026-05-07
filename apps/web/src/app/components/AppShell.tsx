"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@lifeos/ui";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";

const navLinks = [
  { href: "/capture", label: "Capture" },
  { href: "/triage", label: "Triage" },
  { href: "/calendar", label: "Calendar" },
  { href: "/execute", label: "Execute" },
  { href: "/review", label: "Review" },
  { href: "/health", label: "Health" },
  { href: "/settings/areas", label: "Areas" },
];

function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
  } = useWorkflow();
  const currentArea = state.areas.find((a) => a.id === selectedAreaId) ?? state.areas[0];
  const [now, setNow] = useState("--:--:--");

  useEffect(() => {
    const formatNow = () => new Date().toLocaleTimeString();
    setNow(formatNow());

    const intervalId = window.setInterval(() => {
      setNow(formatNow());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e5e7eb",
          padding: "0.75rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/capture" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: "1.05rem",
                color: "#111827",
              }}
            >
              LifeOS
            </span>
          </Link>
          <nav
            aria-label="Primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              fontSize: "0.9rem",
            }}
          >
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/capture" && pathname?.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: "999px",
                    textDecoration: "none",
                    color: isActive ? "#111827" : "#6b7280",
                    backgroundColor: isActive ? "#e5e7eb" : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.8rem",
            color: "#4b5563",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Area</div>
            <select
              aria-label="Current area"
              value={selectedAreaId ?? ""}
              onChange={(event) => setSelectedAreaId(event.target.value || null)}
              style={{
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                padding: "0.15rem 0.5rem",
                fontSize: "0.8rem",
                backgroundColor: "white",
              }}
            >
              {state.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Local time</div>
            <div>{now}</div>
          </div>
          <Button
            type="button"
            onClick={() =>
              submitCaptureText("Quick capture: sort this thought later.", selectedAreaId)
            }
          >
            Quick capture
          </Button>
        </div>
      </header>
      <main
        style={{
          flex: 1,
          padding: "1.5rem",
          maxWidth: "1100px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          aria-label="Current area context"
          style={{ marginBottom: "1rem", fontSize: "0.9rem", color: "#4b5563" }}
        >
          <span style={{ fontWeight: 500 }}>Area:</span> {currentArea?.name}
        </div>
        {children}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkflowProvider>
      <AppChrome>{children}</AppChrome>
    </WorkflowProvider>
  );
}

