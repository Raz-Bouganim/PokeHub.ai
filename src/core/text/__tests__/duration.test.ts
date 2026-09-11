import { describe, expect, it } from "vitest";
import { shortDuration } from "../duration.ts";

describe("shortDuration", () => {
  it("reads anything under a minute as now", () => {
    expect(shortDuration(0)).toBe("now");
    expect(shortDuration(59_000)).toBe("now");
    expect(shortDuration(-5000)).toBe("now");
  });

  it("shows minutes alone under an hour", () => {
    expect(shortDuration(47 * 60_000)).toBe("47m");
    expect(shortDuration(60_000)).toBe("1m");
  });

  it("shows hours and minutes, dropping a zero minute", () => {
    expect(shortDuration(72 * 60_000)).toBe("1h 12m");
    expect(shortDuration(2 * 3_600_000)).toBe("2h");
  });

  it("shows days and hours, dropping a zero hour", () => {
    expect(shortDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe("2d 4h");
    expect(shortDuration(3 * 86_400_000)).toBe("3d");
  });

  it("never shows a third unit", () => {
    expect(shortDuration(86_400_000 + 3_600_000 + 60_000)).toBe("1d 1h");
  });
});
