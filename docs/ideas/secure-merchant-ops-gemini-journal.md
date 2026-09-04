# Secure Merchant Ops Gemini Journal

## Brainstorm Skill Used
Addy Osmani's `agent-skills` pack was downloaded into `.commandcode/skills/agent-skills` and the `idea-refine` brainstorming workflow was used to diverge, stress-test, and converge on this concept for the Gen AI Academy APAC Ideathon.

## Problem Statement
How might we help a merchant founder privately turn payment-operation notes, incidents, and growth ideas into actionable AI plans while proving the Ideathon's required production controls: Firebase Auth, user-isolated Firestore, Gemini multi-turn chat, Secret Manager, and Cloud Run?

## Explored Directions
1. **Plain Personal Gemini Journal** — easiest to match the baseline, but weak differentiation.
2. **Merchant Ops Incident Journal** — useful for payment failures, chargebacks, reconciliation, and KYC notes; strongly aligned with this existing payment dashboard.
3. **Submission Readiness Coach** — helps the builder generate the 1024-character brief, social post outline, and compliance checklist.
4. **Fraud/KYC Reflection Agent** — high-value fintech niche, but riskier because it can imply regulated advice.
5. **Multilingual Founder Journal** — useful across APAC, but language support alone is not enough of a product.
6. **Location-aware Merchant Expansion Journal** — attractive, but adds Maps/API scope that can distract from core security requirements.

## Recommended Direction
Build **Secure Merchant Ops Gemini Journal**: an authenticated AI workspace inside PayDash where each Firebase user can keep private, multi-turn conversations with Gemini about merchant operations, payment reliability, and Ideathon submission planning.

The differentiator is the **Submission Coach mode** plus a **Brainstorm mode inspired by Addy's idea-refine skill**. Instead of being a generic journal, the agent helps a builder refine ideas, surface assumptions, create a not-doing list, and produce a concise challenge-ready solution description. This directly improves the submission while staying small enough to finish and deploy.

## Key Assumptions to Validate
- [ ] Judges reward secure implementation evidence as much as app novelty — validate by clearly showing Firebase Auth, Firestore paths, Secret Manager, and Cloud Run labels in the README/walkthrough.
- [ ] A payment-ops journal is understandable to non-fintech judges — validate with the landing copy and demo prompts.
- [ ] Firebase Google Sign-In is acceptable for all testers — validate by adding the Cloud Run domain to Firebase authorized domains before public submission.
- [ ] Server-side Firestore writes via Admin SDK still satisfy user-isolated storage — validate by documenting `/users/{uid}/interactions/{interactionId}` and shipping owner-bound Firestore rules.

## MVP Scope
**In scope**
- Firebase Google Sign-In in the browser.
- Cloud Run-hosted Next.js API routes that verify Firebase ID tokens with Firebase Admin.
- Multi-turn Gemini responses with a resilient model fallback ladder.
- Firestore persistence under `users/{uid}/interactions/{interactionId}/messages/{messageId}`.
- Gemini API key retrieval from Google Cloud Secret Manager.
- Three separate PayDash pages: Merchant Ops Copilot, Failed Payment Recovery Agent, and Launch Readiness Agent.
- Agent modes: Journal, Brainstorm, Submission Coach, Ops Copilot, Recovery Agent, and Readiness Agent.
- Deployment and submission documentation.

**Out of scope for MVP**
- Direct client-side Firestore access.
- Admin dashboards or cross-user analytics.
- Additional third-party APIs such as Maps/Slack.
- Financial advice, legal advice, or automated payment actions.

## Not Doing (and Why)
- **Email/password forms** — Firebase Google Sign-In outsources credential handling and aligns with the codelab's federated-auth guidance.
- **Client-side Gemini calls** — would expose operational API keys and fail the Secret Manager requirement.
- **Shared conversations collection** — increases cross-user leakage risk; user-scoped Firestore paths are simpler and safer.
- **Overly broad payment automation** — the prototype should journal, brainstorm, and coach; it should not move money or alter production settings.

## Open Questions
- Which Google Cloud project ID and region will be used for the final Cloud Run deployment?
- What public repository URL and Cloud Run URL should be inserted into the final social post and submission brief?
- Should the walkthrough be a short video or a Medium/LinkedIn article with screenshots?
