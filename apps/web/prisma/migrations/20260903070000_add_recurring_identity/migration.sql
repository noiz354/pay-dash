CREATE TABLE "LocalSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantReference" VARCHAR(255) NOT NULL,
    "planKey" VARCHAR(255) NOT NULL,
    "entitlementStatus" VARCHAR(30) NOT NULL,
    "commercialStatus" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "intervalDefinition" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocalSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LocalSubscription_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "LocalSubscription_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ProviderRecurringPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "localSubscriptionId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "canonicalPaymentMethodId" TEXT NOT NULL,
    "providerPlanId" VARCHAR(255) NOT NULL,
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100) NOT NULL,
    "scheduleSummary" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderRecurringPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderRecurringPlan_version_check" CHECK ("version" > 0),
    CONSTRAINT "ProviderRecurringPlan_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE UNIQUE INDEX "LocalSubscription_id_organizationId_key" ON "LocalSubscription"("id", "organizationId");
CREATE UNIQUE INDEX "LocalSubscription_organizationId_merchantReference_key" ON "LocalSubscription"("organizationId", "merchantReference");
CREATE INDEX "LocalSubscription_organizationId_commercialStatus_idx" ON "LocalSubscription"("organizationId", "commercialStatus");
CREATE UNIQUE INDEX "ProviderRecurringPlan_connectionId_providerPlanId_key" ON "ProviderRecurringPlan"("connectionId", "providerPlanId");
CREATE UNIQUE INDEX "ProviderRecurringPlan_localSubscriptionId_version_key" ON "ProviderRecurringPlan"("localSubscriptionId", "version");

ALTER TABLE "LocalSubscription" ADD CONSTRAINT "LocalSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LocalSubscription" ADD CONSTRAINT "LocalSubscription_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "CanonicalCustomer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRecurringPlan" ADD CONSTRAINT "ProviderRecurringPlan_localSubscriptionId_organizationId_fkey" FOREIGN KEY ("localSubscriptionId", "organizationId") REFERENCES "LocalSubscription"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRecurringPlan" ADD CONSTRAINT "ProviderRecurringPlan_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Provider payment-method mapping is unique per canonical method, so this binds
-- recurring execution to the same connection as its provider payment method.
ALTER TABLE "ProviderRecurringPlan" ADD CONSTRAINT "ProviderRecurringPlan_canonicalPaymentMethodId_connectionId_fkey" FOREIGN KEY ("canonicalPaymentMethodId", "connectionId") REFERENCES "ProviderPaymentMethod"("canonicalPaymentMethodId", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
