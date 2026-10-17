import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SupabaseAuthRejectedError } from "@/lib/supabase/server";
import {
  isGoogleCalendarRouteAuthFailure,
  isRequestValidationError,
  logGoogleCalendarRouteFailure,
} from "./routeErrors";

describe("Google Calendar route error helpers", () => {
  it("treats SupabaseAuthRejectedError as an auth failure by name, whatever its message", () => {
    expect(
      isGoogleCalendarRouteAuthFailure(
        new SupabaseAuthRejectedError("invalid claim: missing sub claim"),
      ),
    ).toBe(true);
  });

  it("treats a data-layer JWT rejection as an auth failure", () => {
    expect(isGoogleCalendarRouteAuthFailure(new Error("JWT expired"))).toBe(
      true,
    );
  });

  it("does not treat other errors as auth failures", () => {
    expect(
      isGoogleCalendarRouteAuthFailure(new Error("database timeout")),
    ).toBe(false);
    expect(isGoogleCalendarRouteAuthFailure("JWT expired")).toBe(false);
    expect(isGoogleCalendarRouteAuthFailure(null)).toBe(false);
  });

  it("recognizes a ZodError as a request validation error", () => {
    const result = z.object({ id: z.string().uuid() }).safeParse({ id: "x" });
    expect(result.success).toBe(false);
    expect(isRequestValidationError(result.error)).toBe(true);
    expect(isRequestValidationError(new Error("id is invalid"))).toBe(false);
  });

  it("logs the failure detail server-side", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("relation google_calendar_connections missing");
    logGoogleCalendarRouteFailure("google-calendar/freebusy", error);
    expect(spy).toHaveBeenCalledWith("google-calendar/freebusy failed:", error);
    spy.mockRestore();
  });
});
