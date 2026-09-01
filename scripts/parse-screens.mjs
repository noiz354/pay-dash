#!/usr/bin/env node
// Task 0: Parse 33 screens/code.html → docs/screens-index.json + docs/tokens-diff.md
// Reusable, avoid rewrite — extracts tailwind.config, layout patterns, tokens
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";

const root = join(import.meta.dirname ?? ".", "..");
const screensRoot = join(root, "screens");
const outJson = join(root, "docs", "screens-index.json");
const outDiff = join(root, "docs", "tokens-diff.md");

function listScreens() {
  const all = [];
  for (const platform of ["mobile", "desktop"]) {
    const dir = join(screensRoot, platform);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const html = join(p, "code.html");
      if (existsSync(html)) all.push({ platform, name, folder: `${platform}/${name}`, htmlPath: html });
    }
  }
  return all;
}

function extractTailwindConfig(html) {
  const m = html.match(/tailwind\.config\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!m) return null;
  try {
    // Use Function to evaluate object literal safely (no outer scope)
    const obj = Function(`"use strict"; return (${m[1]})`)();
    return obj;
  } catch (e) {
    return { _error: String(e), raw: m[1].slice(0, 500) };
  }
}

function detectPatterns(html) {
  return {
    hasTestModeBanner: /TEST MODE/i.test(html),
    hasWarningToken: /"warning"\s*:/.test(html) || /test-mode-amber/i.test(html),
    hasBottomNav: /fixed bottom-0.*h-16/i.test(html),
    hasSidebar: /w-sidebar-width|w-\[260px\].*fixed.*left-0/i.test(html),
    hasDataMono: /data-mono|JetBrains Mono/i.test(html),
    hasLabelCaps: /label-caps/i.test(html),
    hasTable: /<table/i.test(html),
    hasMetricCard: /headline-xl|headline-lg.*data-mono/i.test(html),
    inlineConfig: /tailwind\.config/.test(html),
  };
}

function main() {
  const screens = listScreens();
  console.log(`Found ${screens.length} screens`);
  const entries = screens.map((s) => {
    const html = readFileSync(s.htmlPath, "utf-8");
    const config = extractTailwindConfig(html);
    const patterns = detectPatterns(html);
    const colors = config?.theme?.extend?.colors ? Object.keys(config.theme.extend.colors) : [];
    return {
      folder: s.folder,
      platform: s.platform,
      name: s.name,
      colorsCount: colors.length,
      hasWarning: patterns.hasWarningToken,
      patterns,
      colors: config?.theme?.extend?.colors ? config.theme.extend.colors : null,
    };
  });

  // Ensure docs dir
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(outJson, JSON.stringify({ generated: new Date().toISOString(), total: entries.length, screens: entries }, null, 2));
  console.log(`Wrote ${outJson} (${entries.length} entries)`);

  // Tokens diff: Enterprise vs Ledger
  const enterprise = entries.filter((e) => e.platform === "mobile");
  const ledger = entries.filter((e) => e.platform === "desktop");
  const entColors = new Set(enterprise.flatMap((e) => Object.keys(e.colors || {})));
  const ledColors = new Set(ledger.flatMap((e) => Object.keys(e.colors || {})));
  const onlyEnt = [...entColors].filter((c) => !ledColors.has(c));
  const onlyLed = [...ledColors].filter((c) => !entColors.has(c));
  const missingWarning = entries.filter((e) => !e.hasWarning).map((e) => e.folder);

  const diffMd = `# Tokens Diff — Enterprise vs Ledger

Generated: ${new Date().toISOString()}
Total screens: ${entries.length} (mobile ${enterprise.length}, desktop ${ledger.length})

## Counts
- Mobile avg colors: ${(enterprise.reduce((a, e) => a + e.colorsCount, 0) / enterprise.length).toFixed(1)}
- Desktop avg colors: ${(ledger.reduce((a, e) => a + e.colorsCount, 0) / ledger.length).toFixed(1)}

## Only in Enterprise (mobile)
${onlyEnt.length ? onlyEnt.map((c) => `- ${c}`).join("\n") : "- none"}

## Only in Ledger (desktop)
${onlyLed.length ? onlyLed.map((c) => `- ${c}`).join("\n") : "- none"}

## Missing warning/test-mode-amber token
${missingWarning.length} screens without warning:
${missingWarning.map((f) => `- ${f}`).join("\n")}

## Pattern summary
- TEST MODE banner: ${entries.filter((e) => e.patterns.hasTestModeBanner).length}/${entries.length}
- BottomNav: ${entries.filter((e) => e.patterns.hasBottomNav).length}
- Sidebar: ${entries.filter((e) => e.patterns.hasSidebar).length}
- Table: ${entries.filter((e) => e.patterns.hasTable).length}
- DataMono: ${entries.filter((e) => e.patterns.hasDataMono).length}
- LabelCaps: ${entries.filter((e) => e.patterns.hasLabelCaps).length}
`;
  writeFileSync(outDiff, diffMd);
  console.log(`Wrote ${outDiff}`);

  // Summary
  console.log(`\nPattern summary:`);
  console.log(`- warning token: ${entries.filter((e) => e.hasWarning).length}/${entries.length}`);
  console.log(`- TEST MODE: ${entries.filter((e) => e.patterns.hasTestModeBanner).length}/${entries.length}`);
}

main();
