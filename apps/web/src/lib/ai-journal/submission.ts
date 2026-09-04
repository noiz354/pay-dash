export type SubmissionLinks = {
  prototypeUrl: string;
  socialPostUrl: string;
  repositoryUrl: string;
};

export type SubmissionChecklistItem = {
  id: string;
  label: string;
  complete: boolean;
  hint: string;
};

const MAX_BRIEF_CHARS = 1024;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildSubmissionChecklist(links: SubmissionLinks): SubmissionChecklistItem[] {
  return [
    {
      id: "prototype",
      label: "Working Cloud Run prototype link",
      complete: isHttpUrl(links.prototypeUrl),
      hint: "Use the public Cloud Run service URL or a walkthrough URL.",
    },
    {
      id: "social",
      label: "Demo social post with #AccelerateAIwithCloudRun",
      complete: isHttpUrl(links.socialPostUrl),
      hint: "LinkedIn, X, Facebook, Medium, or another public post is accepted.",
    },
    {
      id: "repo",
      label: "Public GitHub/GitLab repository link",
      complete: isHttpUrl(links.repositoryUrl),
      hint: "The repository must be publicly accessible to reviewers.",
    },
    {
      id: "firebase",
      label: "Firebase Authentication",
      complete: true,
      hint: "Google Sign-In is implemented with Firebase Auth in the browser.",
    },
    {
      id: "firestore",
      label: "User-isolated Firestore storage",
      complete: true,
      hint: "Threads are scoped to users/{uid}/interactions/{interactionId}/messages.",
    },
    {
      id: "gemini",
      label: "Multi-turn Gemini API interaction",
      complete: true,
      hint: "The server sends recent conversation history to Gemini with mode-specific instructions.",
    },
    {
      id: "secret-manager",
      label: "Secure key retrieval with Secret Manager",
      complete: true,
      hint: "Gemini API key is read server-side from Google Cloud Secret Manager.",
    },
  ];
}

export function buildSubmissionBrief(): string {
  const brief =
    "PayDash Gemini Journal is a secure merchant-ops AI workspace deployed on Cloud Run. Users sign in with Firebase Google Authentication, then use three PayDash-specific Gemini agents: Merchant Ops Copilot, Failed Payment Recovery, and Launch Readiness, plus Brainstorm and Submission Coach modes. Every prompt and Gemini response is stored privately in Cloud Firestore under users/{uid}/interactions/{interactionId}/messages, preventing cross-user leakage. The browser never receives Gemini credentials; the Cloud Run server verifies Firebase ID tokens with Firebase Admin and retrieves the Gemini API key from Google Cloud Secret Manager at runtime. Original enhancement: PayDash ledger, payout, risk, webhook, and onboarding context become private AI workflows for operations, revenue recovery, and launch readiness.";

  return brief.slice(0, MAX_BRIEF_CHARS);
}

export function buildSocialPost(links: SubmissionLinks): string {
  const prototype = isHttpUrl(links.prototypeUrl) ? `\nPrototype: ${links.prototypeUrl.trim()}` : "";
  const repository = isHttpUrl(links.repositoryUrl) ? `\nCode: ${links.repositoryUrl.trim()}` : "";

  return `I built PayDash Gemini Journal for the Gen AI Academy APAC Ideathon: a secure merchant-ops AI workspace on Cloud Run with Firebase Auth, user-isolated Firestore, Gemini multi-turn conversations, and Secret Manager-based key handling.\n\nOriginal enhancement: three PayDash agent pages for Merchant Ops, Failed Payment Recovery, and Launch Readiness, plus Brainstorm Skill and Submission Coach modes.${prototype}${repository}\n\n#AccelerateAIwithCloudRun`;
}
