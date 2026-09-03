CREATE TABLE "CanonicalPaymentMethod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayType" VARCHAR(50) NOT NULL,
    "displayLabel" VARCHAR(255),
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "reusability" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanonicalPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderPaymentMethod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalPaymentMethodId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerCustomerMappingId" TEXT NOT NULL,
    "providerPaymentMethodId" VARCHAR(255) NOT NULL,
    "providerStatus" VARCHAR(100) NOT NULL,
    "providerType" VARCHAR(100) NOT NULL,
    "channelCode" VARCHAR(100),
    "maskedDetails" JSONB NOT NULL,
    "providerUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalPaymentMethod_id_organizationId_key" ON "CanonicalPaymentMethod"("id", "organizationId");
CREATE INDEX "CanonicalPaymentMethod_organizationId_customerId_idx" ON "CanonicalPaymentMethod"("organizationId", "customerId");
CREATE UNIQUE INDEX "ProviderPaymentMethod_canonicalPaymentMethodId_key" ON "ProviderPaymentMethod"("canonicalPaymentMethodId");
CREATE UNIQUE INDEX "ProviderPaymentMethod_canonicalPaymentMethodId_organizationId_key" ON "ProviderPaymentMethod"("canonicalPaymentMethodId", "organizationId");
CREATE UNIQUE INDEX "ProviderPaymentMethod_canonicalPaymentMethodId_connectionId_key" ON "ProviderPaymentMethod"("canonicalPaymentMethodId", "connectionId");
CREATE UNIQUE INDEX "ProviderPaymentMethod_connectionId_providerPaymentMethodId_key" ON "ProviderPaymentMethod"("connectionId", "providerPaymentMethodId");

ALTER TABLE "CanonicalPaymentMethod" ADD CONSTRAINT "CanonicalPaymentMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalPaymentMethod" ADD CONSTRAINT "CanonicalPaymentMethod_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "CanonicalCustomer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPaymentMethod" ADD CONSTRAINT "ProviderPaymentMethod_canonicalPaymentMethodId_organizationId_fkey" FOREIGN KEY ("canonicalPaymentMethodId", "organizationId") REFERENCES "CanonicalPaymentMethod"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPaymentMethod" ADD CONSTRAINT "ProviderPaymentMethod_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderPaymentMethod" ADD CONSTRAINT "ProviderPaymentMethod_providerCustomerMappingId_connectionId_fkey" FOREIGN KEY ("providerCustomerMappingId", "connectionId") REFERENCES "ProviderCustomer"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
