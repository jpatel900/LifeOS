import { describe, expect, it } from "vitest";
import { describeGoogleCalendarConnectionError } from "./connectionErrorCopy";

describe("describeGoogleCalendarConnectionError (#743)", () => {
  it("returns null when there is no stored error", () => {
    expect(describeGoogleCalendarConnectionError(null)).toBeNull();
    expect(describeGoogleCalendarConnectionError(undefined)).toBeNull();
  });

  it("maps a known Google OAuth error code to a plain-language glance sentence", () => {
    const result = describeGoogleCalendarConnectionError({
      code: "invalid_grant",
      description: "Malformed auth code.",
    });

    expect(result).toEqual({
      code: "invalid_grant",
      description: "Malformed auth code.",
      glance:
        "The sign-in code expired or was already used. Try connecting again.",
    });
  });

  it("maps invalid_client and redirect_uri_mismatch without provider jargon", () => {
    expect(
      describeGoogleCalendarConnectionError({
        code: "invalid_client",
        description: null,
      })?.glance,
    ).toBe("Google didn't accept LifeOS's app credentials.");

    expect(
      describeGoogleCalendarConnectionError({
        code: "redirect_uri_mismatch",
        description: null,
      })?.glance,
    ).toBe("The app's return address doesn't match Google's records.");
  });

  it("falls back to a code-carrying sentence for an unrecognized code", () => {
    const result = describeGoogleCalendarConnectionError({
      code: "admin_policy_enforced",
      description: null,
    });

    expect(result?.glance).toBe(
      "Google sent back something LifeOS doesn't recognize yet (code: admin_policy_enforced).",
    );
  });
});
