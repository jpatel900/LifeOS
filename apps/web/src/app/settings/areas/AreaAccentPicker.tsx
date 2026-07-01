"use client";

import { Button } from "@/components/ui/button";
import { AREA_COLOR_PRESETS, buildAreaAccentStyle } from "@/lib/areaAccent";

interface AreaAccentPickerProps {
  selectedColor: string | null;
  disabled?: boolean;
  includeDefault?: boolean;
  onSelect: (color: string) => void;
  onDefault?: () => void;
}

export function AreaAccentPicker({
  selectedColor,
  disabled = false,
  includeDefault = false,
  onSelect,
  onDefault,
}: AreaAccentPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {AREA_COLOR_PRESETS.map((preset) => (
        <Button
          key={preset.value}
          type="button"
          size="sm"
          variant={selectedColor === preset.value ? "secondary" : "outline"}
          className="gap-2"
          onClick={() => onSelect(preset.value)}
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-full border border-border bg-[var(--area-accent)]"
            style={buildAreaAccentStyle(preset.value)}
          />
          {preset.label}
        </Button>
      ))}
      {includeDefault ? (
        <Button
          type="button"
          size="sm"
          variant={selectedColor === null ? "secondary" : "ghost"}
          onClick={onDefault}
          disabled={disabled}
        >
          Default
        </Button>
      ) : null}
    </div>
  );
}
