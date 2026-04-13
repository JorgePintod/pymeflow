-- CreateTable
CREATE TABLE "caf_ranges" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "environment" "SiiEnvironment" NOT NULL DEFAULT 'CERTIFICATION',
    "folioStart" INTEGER NOT NULL,
    "folioEnd" INTEGER NOT NULL,
    "nextFolio" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isExhausted" BOOLEAN NOT NULL DEFAULT false,
    "cafXml" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),

    CONSTRAINT "caf_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caf_ranges_tenantId_documentType_environment_isActive_idx" ON "caf_ranges"("tenantId", "documentType", "environment", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "caf_ranges_tenantId_documentType_environment_folioStart_key" ON "caf_ranges"("tenantId", "documentType", "environment", "folioStart");
