-- Wave 0 foundation persistence: provider-connections verification evidence,
-- provider-secrets record (never a plaintext secret), durable-operations,
-- audit-ledger, webhook-ingress delivery. Additive only; existing tables and
-- Better Auth models are untouched.

-- 1. Verification evidence on the connection (never a secret).
ALTER TABLE "PaymentProviderConnection"
  ADD COLUMN "capabilityManifest" JSONB,
  ADD COLUMN "requirements" JSONB,
  ADD COLUMN "webhookHealthStatus" VARCHAR(30),
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "updatedByUserId" TEXT;

-- 2. SecretRecord — stores an opaque secretRef + metadata only.
CREATE TABLE "SecretRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "secretRef" VARCHAR(255) NOT NULL,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecretRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SecretRecord_provider_format_check"
      CHECK ("provider" ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT "SecretRecord_mode_check"
      CHECK ("mode" IN ('TEST', 'LIVE'))
);

CREATE UNIQUE INDEX "SecretRecord_connectionId_mode_key"
  ON "SecretRecord"("connectionId", "mode");
CREATE INDEX "SecretRecord_organizationId_provider_mode_idx"
  ON "SecretRecord"("organizationId", "provider", "mode");

ALTER TABLE "SecretRecord"
  ADD CONSTRAINT "SecretRecord_connectionId_organizationId_fkey"
  FOREIGN KEY ("connectionId", "organizationId")
  REFERENCES "PaymentProviderConnection"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SecretRecord"
  ADD CONSTRAINT "SecretRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. DurableOperation — persist intent before a provider write.
CREATE TABLE "DurableOperation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationType" VARCHAR(50) NOT NULL,
    "resourceType" VARCHAR(50) NOT NULL,
    "resourceId" VARCHAR(255),
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "amountMinor" VARCHAR(64),
    "currency" CHAR(3),
    "approvalState" VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
    "mfaProofRef" TEXT,
    "state" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerReference" VARCHAR(255),
    "unknownOutcome" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DurableOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DurableOperation_state_check"
      CHECK ("state" IN ('DRAFT','PENDING_APPROVAL','APPROVED','EXECUTING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED')),
    CONSTRAINT "DurableOperation_approvalState_check"
      CHECK ("approvalState" IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'))
);

CREATE UNIQUE INDEX "DurableOperation_idempotencyKey_key"
  ON "DurableOperation"("idempotencyKey");
CREATE INDEX "DurableOperation_organizationId_state_idx"
  ON "DurableOperation"("organizationId", "state");
CREATE INDEX "DurableOperation_connectionId_operationType_resourceId_idx"
  ON "DurableOperation"("connectionId", "operationType", "resourceId");

ALTER TABLE "DurableOperation"
  ADD CONSTRAINT "DurableOperation_connectionId_organizationId_fkey"
  FOREIGN KEY ("connectionId", "organizationId")
  REFERENCES "PaymentProviderConnection"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DurableOperation"
  ADD CONSTRAINT "DurableOperation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. AuditEvent — immutable security/financial audit records.
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "metadata" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditEvent_outcome_check"
      CHECK ("outcome" IN ('SUCCESS','FAILURE','UNKNOWN','SKIPPED'))
);

CREATE UNIQUE INDEX "AuditEvent_eventId_key"
  ON "AuditEvent"("eventId");
CREATE INDEX "AuditEvent_organizationId_action_createdAt_idx"
  ON "AuditEvent"("organizationId", "action", "createdAt");

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. WebhookDelivery — durable per-event receipt with redacted payload.
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerEventId" VARCHAR(255) NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "connectionId" TEXT,
    "organizationId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
    "processingStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "redactedPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebhookDelivery_provider_check"
      CHECK ("provider" IN ('xendit','stripe')),
    CONSTRAINT "WebhookDelivery_verificationStatus_check"
      CHECK ("verificationStatus" IN ('VERIFIED','UNVERIFIED','INVALID','UNCONFIGURED')),
    CONSTRAINT "WebhookDelivery_processingStatus_check"
      CHECK ("processingStatus" IN ('PENDING','PROCESSING','SUCCEEDED','FAILED','DEAD_LETTER'))
);

CREATE UNIQUE INDEX "WebhookDelivery_provider_providerEventId_key"
  ON "WebhookDelivery"("provider", "providerEventId");
CREATE INDEX "WebhookDelivery_organizationId_processingStatus_receivedAt_idx"
  ON "WebhookDelivery"("organizationId", "processingStatus", "receivedAt");

ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
