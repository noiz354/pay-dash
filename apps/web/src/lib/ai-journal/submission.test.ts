import { describe, expect, it } from "vitest";
import { buildSocialPost, buildSubmissionBrief, buildSubmissionChecklist, isHttpUrl } from "./submission";

describe("AI journal submission helpers", () => {
  it("keeps the form brief under the Ideathon character limit", () => {
    const brief = buildSubmissionBrief();

    expect(brief.length).toBeLessThanOrEqual(1024);
    expect(brief).toContain("Firebase");
    expect(brief).toContain("Firestore");
    expect(brief).toContain("Cloud Run");
    expect(brief).toContain("Gemini");
    expect(brief).toContain("Secret Manager");
  });

  it("validates http and https links only", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("not-a-url")).toBe(false);
  });

  it("marks dynamic submission links separately from implemented services", () => {
    const checklist = buildSubmissionChecklist({ prototypeUrl: "", socialPostUrl: "", repositoryUrl: "" });

    expect(checklist.filter((item) => item.complete).map((item) => item.id)).toEqual([
      "firebase",
      "firestore",
      "gemini",
      "secret-manager",
    ]);
  });

  it("includes the required hashtag in social copy", () => {
    expect(
      buildSocialPost({
        prototypeUrl: "https://service.a.run.app/ai-journal",
        socialPostUrl: "",
        repositoryUrl: "https://github.com/noiz354/pay-dash",
      })
    ).toContain("#AccelerateAIwithCloudRun");
  });
});
