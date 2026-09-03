-- Provider-domain foundation: additive identity tables only.
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProviderConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "providerAccountId" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentProviderConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentProviderConnection_provider_format_check"
      CHECK ("provider" ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT "PaymentProviderConnection_mode_check"
      CHECK ("mode" IN ('TEST', 'LIVE'))
);

CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "providerAccountType" VARCHAR(50) NOT NULL,
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    "providerStatus" VARCHAR(100),
    "capabilitiesSummary" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentProviderConnection_id_organizationId_key"
  ON "PaymentProviderConnection"("id", "organizationId");
CREATE INDEX "PaymentProviderConnection_organizationId_provider_mode_idx"
  ON "PaymentProviderConnection"("organizationId", "provider", "mode");
CREATE INDEX "PaymentProviderConnection_provider_providerAccountId_idx"
  ON "PaymentProviderConnection"("provider", "providerAccountId");
CREATE UNIQUE INDEX "ProviderAccount_connectionId_providerAccountId_key"
  ON "ProviderAccount"("connectionId", "providerAccountId");
CREATE INDEX "ProviderAccount_organizationId_idx"
  ON "ProviderAccount"("organizationId");

ALTER TABLE "PaymentProviderConnection"
  ADD CONSTRAINT "PaymentProviderConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK makes cross-organization account/connection attachment impossible.
ALTER TABLE "ProviderAccount"
  ADD CONSTRAINT "ProviderAccount_connectionId_organizationId_fkey"
  FOREIGN KEY ("connectionId", "organizationId")
  REFERENCES "PaymentProviderConnection"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderAccount"
  ADD CONSTRAINT "ProviderAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
