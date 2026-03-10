-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DI', 'GA');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FILED', 'AMENDED');

-- CreateEnum
CREATE TYPE "Quarter" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "plateNumber" TEXT,
    "vin" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IftaTaxRate" (
    "id" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" "Quarter" NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "taxRate" DECIMAL(10,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IftaTaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IftaReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "truckId" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" "Quarter" NOT NULL,
    "fuelType" "FuelType" NOT NULL DEFAULT 'DI',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "totalMiles" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "averageMpg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalTaxDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "filedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IftaReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IftaReportLine" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL DEFAULT 'DI',
    "taxRate" DECIMAL(10,4) NOT NULL,
    "taxableMiles" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxableGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netTaxableGallons" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IftaReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "truckId" TEXT,
    "reportId" TEXT,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "totalMiles" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMileage" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "miles" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripMileage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "truckId" TEXT,
    "reportId" TEXT,
    "jurisdictionId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "fuelType" "FuelType" NOT NULL DEFAULT 'DI',
    "gallons" DECIMAL(12,2) NOT NULL,
    "pricePerGallon" DECIMAL(10,4),
    "totalAmount" DECIMAL(12,2),
    "vendor" TEXT,
    "receiptNumber" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Truck_vin_key" ON "Truck"("vin");

-- CreateIndex
CREATE INDEX "Truck_userId_idx" ON "Truck"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_code_key" ON "Jurisdiction"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_name_key" ON "Jurisdiction"("name");

-- CreateIndex
CREATE INDEX "IftaTaxRate_year_quarter_idx" ON "IftaTaxRate"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "IftaTaxRate_jurisdictionId_year_quarter_fuelType_key" ON "IftaTaxRate"("jurisdictionId", "year", "quarter", "fuelType");

-- CreateIndex
CREATE INDEX "IftaReport_userId_year_quarter_idx" ON "IftaReport"("userId", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "IftaReport_userId_truckId_year_quarter_fuelType_key" ON "IftaReport"("userId", "truckId", "year", "quarter", "fuelType");

-- CreateIndex
CREATE INDEX "IftaReportLine_reportId_idx" ON "IftaReportLine"("reportId");

-- CreateIndex
CREATE INDEX "IftaReportLine_jurisdictionId_idx" ON "IftaReportLine"("jurisdictionId");

-- CreateIndex
CREATE UNIQUE INDEX "IftaReportLine_reportId_jurisdictionId_fuelType_key" ON "IftaReportLine"("reportId", "jurisdictionId", "fuelType");

-- CreateIndex
CREATE INDEX "Trip_userId_tripDate_idx" ON "Trip"("userId", "tripDate");

-- CreateIndex
CREATE INDEX "Trip_reportId_idx" ON "Trip"("reportId");

-- CreateIndex
CREATE INDEX "TripMileage_jurisdictionId_idx" ON "TripMileage"("jurisdictionId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMileage_tripId_jurisdictionId_key" ON "TripMileage"("tripId", "jurisdictionId");

-- CreateIndex
CREATE INDEX "FuelPurchase_userId_purchaseDate_idx" ON "FuelPurchase"("userId", "purchaseDate");

-- CreateIndex
CREATE INDEX "FuelPurchase_reportId_idx" ON "FuelPurchase"("reportId");

-- CreateIndex
CREATE INDEX "FuelPurchase_jurisdictionId_idx" ON "FuelPurchase"("jurisdictionId");

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IftaTaxRate" ADD CONSTRAINT "IftaTaxRate_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IftaReport" ADD CONSTRAINT "IftaReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IftaReport" ADD CONSTRAINT "IftaReport_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IftaReportLine" ADD CONSTRAINT "IftaReportLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "IftaReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IftaReportLine" ADD CONSTRAINT "IftaReportLine_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "IftaReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMileage" ADD CONSTRAINT "TripMileage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMileage" ADD CONSTRAINT "TripMileage_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPurchase" ADD CONSTRAINT "FuelPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPurchase" ADD CONSTRAINT "FuelPurchase_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPurchase" ADD CONSTRAINT "FuelPurchase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "IftaReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPurchase" ADD CONSTRAINT "FuelPurchase_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
