#!/usr/bin/env node
// Ensure a Chromium binary exists for Playwright — for environments where
// cdn.playwright.dev is unreachable (the E2E sandbox), the binary is extracted
// from the @sparticuz/chromium npm tarball (registry.npmjs.org is reachable)
// into /tmp/chromium, with its bundled NSS/nspr libs in /tmp/al2023-libs/lib.
//
// Resolution order:
//   1. PW_EXECUTABLE_PATH env (explicit override)
//   2. The standard Playwright browser cache (~/.cache/ms-playwright/chromium-*)
//   3. An already-extracted /tmp/chromium
//   4. Bootstrap: npm-install @sparticuz/chromium into /tmp/pw-browser, extract
//      the executable + libs (idempotent; safe to re-run every session).

import { execSync } from "node:child_process";
import fs from "node:fs";

const CACHE = `${process.env.HOME ?? "~"}/.cache/ms-playwright`;

function hasPlaywrightChromium() {
  try {
    return fs.readdirSync(CACHE).some((d) => d.startsWith("chromium-"));
  } catch {
    return false;
  }
}

if (process.env.PW_EXECUTABLE_PATH) {
  console.log(`[ensure-e2e-browser] PW_EXECUTABLE_PATH is set: ${process.env.PW_EXECUTABLE_PATH}`);
  process.exit(0);
}
if (hasPlaywrightChromium()) {
  console.log("[ensure-e2e-browser] Playwright-managed Chromium present in cache.");
  process.exit(0);
}
if (fs.existsSync("/tmp/chromium")) {
  console.log("[ensure-e2e-browser] Sandbox Chromium already extracted at /tmp/chromium.");
  process.exit(0);
}

console.log("[ensure-e2e-browser] Bootstrapping Chromium from the @sparticuz/chromium npm tarball…");
fs.mkdirSync("/tmp/pw-browser", { recursive: true });
execSync("npm init -y", { cwd: "/tmp/pw-browser", stdio: "ignore" });
execSync("npm install @sparticuz/chromium --no-audit --no-fund", { cwd: "/tmp/pw-browser", stdio: "inherit" });

// Extract the executable (this also drops the swiftshader/fonts bundles).
execSync(
  'node --input-type=module -e "import chromium from \'@sparticuz/chromium\'; console.log(\'executable:\', await chromium.executablePath());"',
  { cwd: "/tmp/pw-browser", stdio: "inherit", env: { ...process.env } },
);

// Extract the bundled AL2023 shared libs (nss/nspr/…); the launcher puts them
// on LD_LIBRARY_PATH — see playwright.config.ts.
const binDir = "/tmp/pw-browser/node_modules/@sparticuz/chromium/bin";
execSync(
  `node -e "const {brotliDecompressSync}=require('zlib');const fs=require('fs');fs.writeFileSync('/tmp/al2023.tar',brotliDecompressSync(fs.readFileSync('${binDir}/al2023.tar.br')));"`,
  { stdio: "inherit" },
);
fs.mkdirSync("/tmp/al2023-libs", { recursive: true });
execSync("tar -xf /tmp/al2023.tar -C /tmp/al2023-libs", { stdio: "inherit" });

if (!fs.existsSync("/tmp/chromium")) {
  console.error("[ensure-e2e-browser] extraction did not produce /tmp/chromium");
  process.exit(1);
}
console.log("[ensure-e2e-browser] Chromium ready: /tmp/chromium (libs: /tmp/al2023-libs/lib)");
