CREATE TABLE "CanonicalRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "merchantReference" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reasonCode" VARCHAR(100),
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanonicalRefund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CanonicalRefund_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "CanonicalRefund_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "CanonicalRefund_version_check" CHECK ("version" > 0)
);

CREATE TABLE "ProviderRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalRefundId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerRefundId" VARCHAR(255) NOT NULL,
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100) NOT NULL,
    "failureCode" VARCHAR(100),
    "providerUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalRefund_id_organizationId_key" ON "CanonicalRefund"("id", "organizationId");
CREATE UNIQUE INDEX "CanonicalRefund_organizationId_merchantReference_key" ON "CanonicalRefund"("organizationId", "merchantReference");
CREATE INDEX "CanonicalRefund_paymentId_canonicalStatus_idx" ON "CanonicalRefund"("paymentId", "canonicalStatus");
CREATE UNIQUE INDEX "ProviderRefund_canonicalRefundId_key" ON "ProviderRefund"("canonicalRefundId");
CREATE UNIQUE INDEX "ProviderRefund_canonicalRefundId_organizationId_key" ON "ProviderRefund"("canonicalRefundId", "organizationId");
CREATE UNIQUE INDEX "ProviderRefund_connectionId_providerRefundId_key" ON "ProviderRefund"("connectionId", "providerRefundId");

ALTER TABLE "CanonicalRefund" ADD CONSTRAINT "CanonicalRefund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CanonicalRefund" ADD CONSTRAINT "CanonicalRefund_paymentId_organizationId_fkey" FOREIGN KEY ("paymentId", "organizationId") REFERENCES "CanonicalPayment"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_canonicalRefundId_organizationId_fkey" FOREIGN KEY ("canonicalRefundId", "organizationId") REFERENCES "CanonicalRefund"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- This composite FK binds the refund directly to the payment's originating connection.
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_providerPaymentId_connectionId_fkey" FOREIGN KEY ("providerPaymentId", "connectionId") REFERENCES "ProviderPayment"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRefund" ADD CONSTRAINT "ProviderRefund_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
