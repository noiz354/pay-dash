CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "merchantReference" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayoutBatch_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "PayoutBatch_version_check" CHECK ("version" > 0)
);

CREATE TABLE "PayoutRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "recipientReference" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "destinationRef" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutRecipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayoutRecipient_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "PayoutRecipient_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ProviderPayoutAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "providerPayoutId" VARCHAR(255),
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100) NOT NULL,
    "failureCode" VARCHAR(100),
    "estimatedArrivalAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderPayoutAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderPayoutAttempt_attemptNumber_check" CHECK ("attemptNumber" > 0)
);

CREATE UNIQUE INDEX "PayoutBatch_id_organizationId_key" ON "PayoutBatch"("id", "organizationId");
CREATE UNIQUE INDEX "PayoutBatch_organizationId_merchantReference_key" ON "PayoutBatch"("organizationId", "merchantReference");
CREATE INDEX "PayoutBatch_organizationId_canonicalStatus_createdAt_idx" ON "PayoutBatch"("organizationId", "canonicalStatus", "createdAt");
CREATE UNIQUE INDEX "PayoutRecipient_id_organizationId_key" ON "PayoutRecipient"("id", "organizationId");
CREATE UNIQUE INDEX "PayoutRecipient_batchId_recipientReference_key" ON "PayoutRecipient"("batchId", "recipientReference");
CREATE UNIQUE INDEX "ProviderPayoutAttempt_recipientId_attemptNumber_key" ON "ProviderPayoutAttempt"("recipientId", "attemptNumber");
CREATE UNIQUE INDEX "ProviderPayoutAttempt_connectionId_providerPayoutId_key" ON "ProviderPayoutAttempt"("connectionId", "providerPayoutId");

ALTER TABLE "PayoutBatch" ADD CONSTRAINT "PayoutBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRecipient" ADD CONSTRAINT "PayoutRecipient_batchId_organizationId_fkey" FOREIGN KEY ("batchId", "organizationId") REFERENCES "PayoutBatch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPayoutAttempt" ADD CONSTRAINT "ProviderPayoutAttempt_recipientId_organizationId_fkey" FOREIGN KEY ("recipientId", "organizationId") REFERENCES "PayoutRecipient"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPayoutAttempt" ADD CONSTRAINT "ProviderPayoutAttempt_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
