// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  UNAUTHENTICATED_ORG,
  authEnforcementMode,
  demoOrgFallbackPermitted,
  isProductionDeployment,
} from "./demo-org-policy";

/**
 * Audit findings S-01 and §3.5. The question "may an unauthenticated request be
 * served the demo organization?" used to be answered in two places, differently,
 * and by accident. These tests pin the single answer down.
 */

const DEV = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
const TEST = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const PROD_BY_APP_ENV = { NODE_ENV: "development", APP_ENV: "production" } as NodeJS.ProcessEnv;

describe("authEnforcementMode", () => {
  it("defaults to strict when the variable is unset", () => {
    expect(authEnforcementMode(DEV)).toBe("strict");
  });

  it("treats off/0/false as off and preview as preview", () => {
    for (const v of ["off", "0", "false"]) {
      expect(authEnforcementMode({ ...DEV, AUTH_ENFORCED: v } as NodeJS.ProcessEnv)).toBe("off");
    }
    expect(authEnforcementMode({ ...DEV, AUTH_ENFORCED: "preview" } as NodeJS.ProcessEnv)).toBe("preview");
  });

  it("fails safe on an unrecognized value", () => {
    // A typo must not silently disable authentication.
    expect(authEnforcementMode({ ...DEV, AUTH_ENFORCED: "offf" } as NodeJS.ProcessEnv)).toBe("strict");
    expect(authEnforcementMode({ ...DEV, AUTH_ENFORCED: "Off" } as NodeJS.ProcessEnv)).toBe("strict");
  });
});

describe("isProductionDeployment", () => {
  it("is false in development and test", () => {
    expect(isProductionDeployment(DEV)).toBe(false);
    expect(isProductionDeployment(TEST)).toBe(false);
  });

  it("is true from NODE_ENV or from APP_ENV", () => {
    expect(isProductionDeployment(PROD)).toBe(true);
    // APP_ENV is the deployment's own declaration and wins even when NODE_ENV
    // was not set correctly by the start command.
    expect(isProductionDeployment(PROD_BY_APP_ENV)).toBe(true);
  });
});

describe("demoOrgFallbackPermitted", () => {
  it("is permitted in development and test, so the dashboard stays usable", () => {
    expect(demoOrgFallbackPermitted(undefined, DEV)).toBe(true);
    expect(demoOrgFallbackPermitted(undefined, TEST)).toBe(true);
  });

  it("is refused in production — this is the S-01 fix", () => {
    expect(demoOrgFallbackPermitted(undefined, PROD)).toBe(false);
    expect(demoOrgFallbackPermitted(undefined, PROD_BY_APP_ENV)).toBe(false);
  });

  it("is permitted when AUTH_ENFORCED=off, even in production", () => {
    // `off` is an explicit declaration that this deployment does not enforce
    // auth at all. Honouring it is the point of the variable.
    expect(demoOrgFallbackPermitted(undefined, { ...PROD, AUTH_ENFORCED: "off" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("is permitted in preview mode only for a request carrying the bypass", () => {
    const preview = { ...PROD, AUTH_ENFORCED: "preview" } as NodeJS.ProcessEnv;
    expect(demoOrgFallbackPermitted({ previewBypass: true }, preview)).toBe(true);
    expect(demoOrgFallbackPermitted({ previewBypass: false }, preview)).toBe(false);
    expect(demoOrgFallbackPermitted(undefined, preview)).toBe(false);
  });

  it("honours an explicit opt-in in both directions", () => {
    expect(demoOrgFallbackPermitted(undefined, { ...PROD, PAYDASH_ENABLE_DEMO_ORG: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(demoOrgFallbackPermitted(undefined, { ...DEV, PAYDASH_ENABLE_DEMO_ORG: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("lets the explicit opt-out win over AUTH_ENFORCED=off", () => {
    // The override is checked first so a deployment can run `off` for other
    // reasons and still refuse to serve the demo ledger.
    const env = { ...DEV, AUTH_ENFORCED: "off", PAYDASH_ENABLE_DEMO_ORG: "false" } as NodeJS.ProcessEnv;
    expect(demoOrgFallbackPermitted(undefined, env)).toBe(false);
  });
});

describe("UNAUTHENTICATED_ORG", () => {
  it("is not the demo org, so scoped reads match no rows", () => {
    expect(UNAUTHENTICATED_ORG).not.toBe("org_demo");
    expect(UNAUTHENTICATED_ORG).toBe("org_unauthenticated");
  });
});
