"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readReEntryThreshold,
  saveReEntryThreshold,
  validThreshold,
} from "@/lib/reEntry/preferences";
import { DEFAULT_RE_ENTRY_THRESHOLD_DAYS } from "@/lib/reEntry/detect";

export function ReEntrySettingsPanel() {
  const [days, setDays] = useState(String(DEFAULT_RE_ENTRY_THRESHOLD_DAYS));
  const [message, setMessage] = useState("");
  // Read only after this disclosure opens; SSR and hydration share seed 3.
  useEffect(() => setDays(String(readReEntryThreshold())), []);
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number(days);
        if (!validThreshold(value)) {
          setMessage("Choose a whole number from 1 to 365 days.");
          return;
        }
        setMessage(
          saveReEntryThreshold(value)
            ? "Saved on this device."
            : "This device could not save the setting. Try again.",
        );
      }}
    >
      <Label htmlFor="re-entry-days">
        Welcome me back after this many days away
      </Label>
      <Input
        id="re-entry-days"
        type="number"
        min={1}
        max={365}
        step={1}
        value={days}
        onChange={(event) => {
          setDays(event.target.value);
          setMessage("");
        }}
        className="min-h-[44px] max-w-32"
      />
      <p className="text-sm text-muted-foreground">
        Applies on this device. Choose 1 to 365 days (up to one year). The
        starting setting is 3 days.
      </p>
      <Button
        type="submit"
        variant="outline"
        className="min-h-[44px] w-fit touch-manipulation"
      >
        Save return setting
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </form>
  );
}
