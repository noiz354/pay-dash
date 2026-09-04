# Addy Osmani Workflow Implementation — PayDash AI UX Improvements

Date: 2026-09-04

This implementation followed the downloaded Addy Osmani `agent-skills` lifecycle: **spec → plan → build → verify → review → ship**.

## 1. Spec

Improve the PayDash Gemini Journal from a basic secure chat into a judge-ready, human-centered AI workspace:

- Make AI scope and limitations explicit.
- Show what context Gemini receives and what secrets/data it never receives.
- Provide evidence panels for the Ideathon requirements.
- Keep users in control with copy, transform, feedback, save, and retry affordances.
- Handle failures gracefully: auth/config issues, Gemini errors, Firestore partial-save failures, rate limits.
- Reduce security risks: prompt injection cues, excessive-agency boundaries, redaction, bounded context, and rate limiting.
- Add evaluation instrumentation without cross-user data leakage.

## 2. Plan

Implementation slices:

1. Shared UX components: AI boundary banner, context transparency panel, judge evidence panel, deep links, empty states.
2. Chat UX controls: copy/redact, regenerate/checklist/translate transformations, feedback capture, save-as-report, retry unsaved response.
3. Server endpoints: feedback, reports, retry message save, per-user evaluation summary, rate-limit enforcement.
4. Data model: conversation tags, message feedback, user-scoped reports, evaluation summary.
5. Agent pages: add panels/deep links/context transparency to Ops, Recovery, Readiness, and add Evaluation dashboard route.
6. Tests: prompt, submission, safety/redaction, repository isolation, rate limit.

## 3. Build summary

Implemented:

- `/ai-journal/evaluation`
- `/api/ai-journal/messages`
- `/api/ai-journal/feedback`
- `/api/ai-journal/reports`
- `/api/ai-journal/evaluation`
- `assertWithinAiJournalRateLimit` for 10 messages / 10 minutes / Firebase UID.
- Firestore reports collection under `users/{uid}/reports/{reportId}`.
- Conversation tags and message feedback.
- Redaction helper for customer names, emails, and card-like method labels.
- Unsafe prompt intent warning for common injection/exfiltration patterns.

## 4. Review checklist

- [x] User remains human-in-loop; no payment/refund/payout/risk-setting mutation is performed by Gemini.
- [x] Gemini API key remains server-side and retrieved via Secret Manager path.
- [x] Firestore access uses verified Firebase UID paths.
- [x] User output is rendered as plain text, not unsafe HTML.
- [x] Failure states give a way forward: retry save, copy unsaved reply, rate-limit retry time, missing config hints.
- [x] Evaluation dashboard reads only the signed-in user's Firestore scope.

## 5. Verification

Executed:

```bash
corepack pnpm --filter web typecheck
corepack pnpm --filter web test -- src/lib/ai-journal/prompt.test.ts src/lib/ai-journal/submission.test.ts src/lib/ai-journal/safety.test.ts src/server/ai-journal/repository.test.ts src/server/ai-journal/rate-limit.test.ts
corepack pnpm --filter web lint
```

Results:

- Typecheck: passed.
- AI journal tests: 13 passed.
- Lint: 0 errors, existing repository warnings remain.
