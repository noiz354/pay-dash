CREATE TABLE "CanonicalCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "merchantReference" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "emailNormalized" VARCHAR(320),
    "appStatus" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanonicalCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalCustomerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerCustomerId" VARCHAR(255) NOT NULL,
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "merchantReference" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "paymentKind" VARCHAR(50) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanonicalPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CanonicalPayment_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "CanonicalPayment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "CanonicalPayment_version_check" CHECK ("version" > 0)
);

CREATE TABLE "ProviderPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalPaymentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerPaymentId" VARCHAR(255) NOT NULL,
    "providerProductId" VARCHAR(255),
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100) NOT NULL,
    "channelCategory" VARCHAR(100),
    "channelCode" VARCHAR(100),
    "cashflow" VARCHAR(30),
    "settlementStatus" VARCHAR(100),
    "feeAmount" DECIMAL(20,4),
    "netAmount" DECIMAL(20,4),
    "occurredAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalCustomer_id_organizationId_key" ON "CanonicalCustomer"("id", "organizationId");
CREATE UNIQUE INDEX "CanonicalCustomer_organizationId_merchantReference_key" ON "CanonicalCustomer"("organizationId", "merchantReference");
CREATE INDEX "CanonicalCustomer_organizationId_emailNormalized_idx" ON "CanonicalCustomer"("organizationId", "emailNormalized");
CREATE UNIQUE INDEX "ProviderCustomer_id_connectionId_key" ON "ProviderCustomer"("id", "connectionId");
CREATE UNIQUE INDEX "ProviderCustomer_connectionId_providerCustomerId_key" ON "ProviderCustomer"("connectionId", "providerCustomerId");
CREATE UNIQUE INDEX "ProviderCustomer_canonicalCustomerId_connectionId_key" ON "ProviderCustomer"("canonicalCustomerId", "connectionId");
CREATE UNIQUE INDEX "CanonicalPayment_id_organizationId_key" ON "CanonicalPayment"("id", "organizationId");
CREATE UNIQUE INDEX "CanonicalPayment_organizationId_merchantReference_key" ON "CanonicalPayment"("organizationId", "merchantReference");
CREATE INDEX "CanonicalPayment_organizationId_canonicalStatus_createdAt_idx" ON "CanonicalPayment"("organizationId", "canonicalStatus", "createdAt");
CREATE UNIQUE INDEX "ProviderPayment_canonicalPaymentId_key" ON "ProviderPayment"("canonicalPaymentId");
CREATE UNIQUE INDEX "ProviderPayment_id_connectionId_key" ON "ProviderPayment"("id", "connectionId");
CREATE UNIQUE INDEX "ProviderPayment_connectionId_providerPaymentId_key" ON "ProviderPayment"("connectionId", "providerPaymentId");
CREATE INDEX "ProviderPayment_connectionId_providerStatus_idx" ON "ProviderPayment"("connectionId", "providerStatus");

ALTER TABLE "CanonicalCustomer" ADD CONSTRAINT "CanonicalCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCustomer" ADD CONSTRAINT "ProviderCustomer_canonicalCustomerId_organizationId_fkey" FOREIGN KEY ("canonicalCustomerId", "organizationId") REFERENCES "CanonicalCustomer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderCustomer" ADD CONSTRAINT "ProviderCustomer_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalPayment" ADD CONSTRAINT "CanonicalPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Customer is optional; its organization match is also checked by the scoped repository transaction.
ALTER TABLE "CanonicalPayment" ADD CONSTRAINT "CanonicalPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CanonicalCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPayment" ADD CONSTRAINT "ProviderPayment_canonicalPaymentId_organizationId_fkey" FOREIGN KEY ("canonicalPaymentId", "organizationId") REFERENCES "CanonicalPayment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPayment" ADD CONSTRAINT "ProviderPayment_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
