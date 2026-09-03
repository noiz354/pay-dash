CREATE TABLE "SplitRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleKey" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "lifecycleStatus" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SplitRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SplitRuleVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "splitRuleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "approvalStatus" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplitRuleVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SplitRuleVersion_version_check" CHECK ("version" > 0),
    CONSTRAINT "SplitRuleVersion_retirement_check" CHECK ("retiredAt" IS NULL OR "effectiveFrom" IS NULL OR "retiredAt" > "effectiveFrom")
);

CREATE TABLE "SplitRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "splitRuleVersionId" TEXT NOT NULL,
    "routeReference" VARCHAR(255) NOT NULL,
    "connectionId" TEXT NOT NULL,
    "destinationProviderAccountId" TEXT NOT NULL,
    "allocationType" VARCHAR(20) NOT NULL,
    "flatAmount" DECIMAL(20,4),
    "percentAmount" DECIMAL(9,6),
    "currency" CHAR(3),
    CONSTRAINT "SplitRoute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SplitRoute_allocation_type_check" CHECK ("allocationType" IN ('FLAT', 'PERCENT')),
    CONSTRAINT "SplitRoute_allocation_shape_check" CHECK (
      ("allocationType" = 'FLAT' AND "flatAmount" IS NOT NULL AND "percentAmount" IS NULL AND "currency" IS NOT NULL)
      OR
      ("allocationType" = 'PERCENT' AND "flatAmount" IS NULL AND "percentAmount" IS NOT NULL AND "currency" IS NULL)
    ),
    CONSTRAINT "SplitRoute_flat_amount_check" CHECK ("flatAmount" IS NULL OR "flatAmount" >= 0),
    CONSTRAINT "SplitRoute_percent_amount_check" CHECK ("percentAmount" IS NULL OR ("percentAmount" > 0 AND "percentAmount" <= 100)),
    CONSTRAINT "SplitRoute_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ProviderSplitRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "splitRuleVersionId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerSplitRuleId" VARCHAR(255) NOT NULL,
    "providerStatus" VARCHAR(100) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    CONSTRAINT "ProviderSplitRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SplitRule_id_organizationId_key" ON "SplitRule"("id", "organizationId");
CREATE UNIQUE INDEX "SplitRule_organizationId_ruleKey_key" ON "SplitRule"("organizationId", "ruleKey");
CREATE UNIQUE INDEX "SplitRuleVersion_id_organizationId_key" ON "SplitRuleVersion"("id", "organizationId");
CREATE UNIQUE INDEX "SplitRuleVersion_splitRuleId_version_key" ON "SplitRuleVersion"("splitRuleId", "version");
CREATE UNIQUE INDEX "SplitRoute_splitRuleVersionId_routeReference_key" ON "SplitRoute"("splitRuleVersionId", "routeReference");
CREATE INDEX "SplitRoute_connectionId_destinationProviderAccountId_idx" ON "SplitRoute"("connectionId", "destinationProviderAccountId");
CREATE UNIQUE INDEX "ProviderSplitRule_connectionId_providerSplitRuleId_key" ON "ProviderSplitRule"("connectionId", "providerSplitRuleId");
CREATE UNIQUE INDEX "ProviderSplitRule_splitRuleVersionId_connectionId_key" ON "ProviderSplitRule"("splitRuleVersionId", "connectionId");

ALTER TABLE "SplitRule" ADD CONSTRAINT "SplitRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitRuleVersion" ADD CONSTRAINT "SplitRuleVersion_splitRuleId_organizationId_fkey" FOREIGN KEY ("splitRuleId", "organizationId") REFERENCES "SplitRule"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitRoute" ADD CONSTRAINT "SplitRoute_splitRuleVersionId_organizationId_fkey" FOREIGN KEY ("splitRuleVersionId", "organizationId") REFERENCES "SplitRuleVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitRoute" ADD CONSTRAINT "SplitRoute_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SplitRoute" ADD CONSTRAINT "SplitRoute_destinationProviderAccountId_connectionId_fkey" FOREIGN KEY ("destinationProviderAccountId", "connectionId") REFERENCES "ProviderAccount"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSplitRule" ADD CONSTRAINT "ProviderSplitRule_splitRuleVersionId_organizationId_fkey" FOREIGN KEY ("splitRuleVersionId", "organizationId") REFERENCES "SplitRuleVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSplitRule" ADD CONSTRAINT "ProviderSplitRule_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
