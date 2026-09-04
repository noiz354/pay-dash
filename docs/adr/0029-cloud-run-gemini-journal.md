# ADR-0029: Cloud Run Gemini Journal for Ideathon

Date: 2026-09-04
Status: Accepted

## Context
The Gen AI Academy APAC Ideathon requires a production-ready authenticated AI application deployed on Cloud Run using Firebase Authentication, Firestore, Gemini API, and Google Cloud Secret Manager. The existing app is a payment dashboard with a Cloud Run-ready Next.js Dockerfile and strong server/API boundaries, but it did not have a Firebase-backed Personal Gemini Journal.

## Decision
We will add `/ai-journal` as a secure merchant-ops Gemini Journal:

- Browser authentication uses Firebase Authentication with Google Sign-In.
- Next.js API routes verify Firebase ID tokens with Firebase Admin before every journal operation.
- Firestore stores conversations under `users/{uid}/interactions/{interactionId}` with a nested `messages` collection.
- Gemini generation happens only on the server, with a model fallback ladder and mode-specific system instructions.
- The Gemini API key is retrieved at runtime from Google Cloud Secret Manager.
- The original enhancement is three PayDash-specific agent pages — Merchant Ops Copilot, Failed Payment Recovery, and Launch Readiness — plus a Brainstorm mode inspired by Addy Osmani's idea-refine skill, a Submission Coach mode for Ideathon readiness, and a Submission Cockpit that prepares copy-ready form/social assets.

## Consequences
Positive:
- Satisfies the Ideathon service checklist without exposing Gemini secrets to the browser.
- Keeps user data isolation simple and reviewable through owner-scoped Firestore paths.
- Reuses the existing Cloud Run standalone Next.js container path.

Negative:
- Firebase Auth becomes a second authentication mechanism alongside the dashboard's existing Better Auth flow.
- Testers must add the Cloud Run domain to Firebase authorized domains for Google Sign-In.
- Firestore Admin writes bypass rules at runtime, so rules must remain documented/deployed to prove intended isolation for any future client reads.

## Alternatives Considered
- Use Better Auth only: rejected because the Ideathon explicitly requires Firebase Authentication.
- Call Gemini from the client: rejected because it would expose the operational API key and fail the Secret Manager requirement.
- Use a shared `interactions` collection with `ownerUid` filters: rejected because path-level user isolation is easier to reason about and safer for rules.

## Verification
- `pnpm --filter web typecheck`
- `pnpm --filter web test -- src/lib/ai-journal/prompt.test.ts`
- Manual Cloud Run walkthrough: sign in with Firebase Google provider, send a Gemini prompt, reload, and reopen history from Firestore.
