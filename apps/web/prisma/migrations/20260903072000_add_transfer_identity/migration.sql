CREATE TABLE "PlatformTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "merchantReference" VARCHAR(255) NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sourceProviderAccountId" TEXT NOT NULL,
    "destinationProviderAccountId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "canonicalStatus" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformTransfer_distinct_accounts_check" CHECK ("sourceProviderAccountId" <> "destinationProviderAccountId"),
    CONSTRAINT "PlatformTransfer_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "PlatformTransfer_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "PlatformTransfer_version_check" CHECK ("version" > 0)
);

CREATE TABLE "ProviderTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformTransferId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "providerTransferId" VARCHAR(255),
    "providerReference" VARCHAR(255),
    "providerStatus" VARCHAR(100) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderTransfer_attemptNumber_check" CHECK ("attemptNumber" > 0)
);

CREATE UNIQUE INDEX "PlatformTransfer_id_connectionId_key" ON "PlatformTransfer"("id", "connectionId");
CREATE UNIQUE INDEX "PlatformTransfer_organizationId_merchantReference_key" ON "PlatformTransfer"("organizationId", "merchantReference");
CREATE UNIQUE INDEX "ProviderTransfer_platformTransferId_attemptNumber_key" ON "ProviderTransfer"("platformTransferId", "attemptNumber");
CREATE UNIQUE INDEX "ProviderTransfer_connectionId_providerTransferId_key" ON "ProviderTransfer"("connectionId", "providerTransferId");

ALTER TABLE "PlatformTransfer" ADD CONSTRAINT "PlatformTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformTransfer" ADD CONSTRAINT "PlatformTransfer_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Both account FKs include connectionId, making cross-provider/connection movement impossible.
ALTER TABLE "PlatformTransfer" ADD CONSTRAINT "PlatformTransfer_sourceProviderAccountId_connectionId_fkey" FOREIGN KEY ("sourceProviderAccountId", "connectionId") REFERENCES "ProviderAccount"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformTransfer" ADD CONSTRAINT "PlatformTransfer_destinationProviderAccountId_connectionId_fkey" FOREIGN KEY ("destinationProviderAccountId", "connectionId") REFERENCES "ProviderAccount"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderTransfer" ADD CONSTRAINT "ProviderTransfer_platformTransferId_connectionId_fkey" FOREIGN KEY ("platformTransferId", "connectionId") REFERENCES "PlatformTransfer"("id", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderTransfer" ADD CONSTRAINT "ProviderTransfer_connectionId_organizationId_fkey" FOREIGN KEY ("connectionId", "organizationId") REFERENCES "PaymentProviderConnection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
