import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges classes", () => {
    expect(cn("p-4", "text-right")).toBe("p-4 text-right");
  });
  it("handles conditional", () => {
    expect(cn("base", false && "hidden")).toBe("base");
  });
});
