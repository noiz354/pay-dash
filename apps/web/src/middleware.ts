// Next.js only picks up `middleware.ts` at the project root *or* inside `src/`
// — never both. Because this app has a `src/` directory, the root
// `middleware.ts` was silently ignored and `src/proxy.ts` never executed
// (symptoms: bare /sign-in 404s, no auth gate, no in-shell 404 fallback).
// This file is the entry point Next actually loads; the logic still lives in
// `src/proxy.ts` and the root file is kept in place.
export { default, config } from "./proxy";
