export const JOURNAL_MODES = [
  "journal",
  "brainstorm",
  "submission-review",
  "ops-copilot",
  "recovery-agent",
  "readiness-agent",
] as const;

export type JournalMode = (typeof JOURNAL_MODES)[number];
export type JournalMessageRole = "user" | "model";
export type JournalFeedbackRating = "useful" | "needs-work";
export type JournalReportKind = "ops-report" | "recovery-plan" | "readiness-checklist" | "submission-brief" | "note";

export type JournalModeMeta = {
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
};

export const JOURNAL_MODE_META: Record<JournalMode, JournalModeMeta> = {
  journal: {
    label: "Secure Journal",
    shortLabel: "Journal",
    icon: "edit_note",
    description: "Reflect on merchant ops, incidents, customer notes, or product decisions.",
  },
  brainstorm: {
    label: "Brainstorm Skill",
    shortLabel: "Brainstorm",
    icon: "psychology",
    description: "Use Addy-style idea refinement: HMW framing, variations, assumptions, and not-doing list.",
  },
  "submission-review": {
    label: "Submission Coach",
    shortLabel: "Submit",
    icon: "task_alt",
    description: "Check Ideathon readiness and draft the 1024-character solution description.",
  },
  "ops-copilot": {
    label: "Merchant Ops Copilot",
    shortLabel: "Ops",
    icon: "support_agent",
    description: "Turn PayDash payment, payout, risk, and webhook signals into daily operating decisions.",
  },
  "recovery-agent": {
    label: "Failed Payment Recovery",
    shortLabel: "Recovery",
    icon: "currency_exchange",
    description: "Analyze failed transactions and draft respectful customer recovery actions.",
  },
  "readiness-agent": {
    label: "Launch Readiness Agent",
    shortLabel: "Readiness",
    icon: "rocket_launch",
    description: "Score production/payment readiness and generate a practical go-live plan.",
  },
};

export type JournalFeedback = {
  rating: JournalFeedbackRating;
  reason: string;
  createdAt: string;
};

export type JournalMessage = {
  id: string;
  role: JournalMessageRole;
  text: string;
  mode: JournalMode;
  createdAt: string;
  feedback?: JournalFeedback;
};

export type JournalConversation = {
  id: string;
  title: string;
  mode: JournalMode;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tags: string[];
};

export type JournalConversationWithMessages = JournalConversation & {
  messages: JournalMessage[];
};

export type JournalReport = {
  id: string;
  kind: JournalReportKind;
  title: string;
  body: string;
  sourceConversationId: string;
  sourceMessageId: string;
  redacted: boolean;
  createdAt: string;
};

export type JournalEvaluationSummary = {
  conversationCount: number;
  messageCount: number;
  reportCount: number;
  usefulFeedbackCount: number;
  needsWorkFeedbackCount: number;
  agentModeCounts: Partial<Record<JournalMode, number>>;
  readinessChecks: Array<{
    id: string;
    label: string;
    complete: boolean;
    detail: string;
  }>;
};

export function isJournalMode(value: string): value is JournalMode {
  return (JOURNAL_MODES as readonly string[]).includes(value);
}

export function isFeedbackRating(value: string): value is JournalFeedbackRating {
  return value === "useful" || value === "needs-work";
}

export function isJournalReportKind(value: string): value is JournalReportKind {
  return (
    value === "ops-report" ||
    value === "recovery-plan" ||
    value === "readiness-checklist" ||
    value === "submission-brief" ||
    value === "note"
  );
}
