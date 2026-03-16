import { formatDuration, getModeColor } from "./entur-trip";

describe("formatDuration", () => {
  it("formats durations under 60 minutes", () => {
    expect(formatDuration(5 * 60)).toBe("5 min");
  });

  it("formats durations over 60 minutes with hours and minutes", () => {
    expect(formatDuration(65 * 60)).toBe("1 t 5 min");
  });

  it("formats whole hours without minutes", () => {
    expect(formatDuration(2 * 60 * 60)).toBe("2 t");
  });
});

describe("getModeColor", () => {
  it("returns specific colors for known modes", () => {
    expect(getModeColor("bus")).toBe("#E60000");
    expect(getModeColor("tram")).toBe("#0B91EF");
  });

  it("falls back to bus color for unknown modes", () => {
    expect(getModeColor("unknown-mode")).toBe("#E60000");
  });
});

