-- Organization membership (organization-access). Links a signed-in user to an
-- organization with an RBAC role. Authorization is always resolved from the
-- authenticated membership, never from the browser.
CREATE TABLE "organization_member" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_member_organizationId_userId_key" ON "organization_member"("organizationId", "userId");
CREATE INDEX "organization_member_userId_idx" ON "organization_member"("userId");

ALTER TABLE "organization_member"
  ADD CONSTRAINT "organization_member_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
