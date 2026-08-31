# Storybook

Component docs + visual tests for `apps/web/src/components/ui` (shadcn/Radix) and `features/*`.

## When to Use

After Phase 0 scaffold. Not needed for pure prototype `screens/*/code.html` — skip until `apps/web` has reusable components.

## Install

```bash
pnpm create storybook@latest
# choose Next.js + Vite framework when prompted
```

Add to `package.json`:

```json
{ "scripts": { "storybook": "storybook dev -p 6006", "build-storybook": "storybook build" } }
```

## Conventions

- One story per exported component, co-located: `components/ui/button.stories.tsx`.
- Use `design-system/*/DESIGN.md` tokens — no new colors in stories.
- A11y addon on; keyboard + reduced-motion checks in CI.
- Visual regression: Chromatic or Playwright screenshots — pick one, not both.

## Verification

`pnpm storybook` starts, `pnpm build-storybook` succeeds, no `lucide-react` runtime errors.
