import { FuelType, Prisma, Quarter } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function decimalToNumber(
  value: Prisma.Decimal | string | number | null | undefined,
) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (!value) return 0;
  return Number(value.toString());
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toDecimalString(value: number, precision: number) {
  return round(value, precision).toFixed(precision);
}

type RateRow = {
  jurisdictionId: string;
  taxRate: Prisma.Decimal;
};

type JurisdictionAggregate = {
  jurisdictionId: string;
  taxableMiles: number;
  taxableGallons: number;
  paidGallons: number;
  netTaxableGallons: number;
  taxRate: number;
  taxDue: number;
};

function buildJurisdictionAggregates(params: {
  milesByJurisdiction: Map<string, number>;
  paidGallonsByJurisdiction: Map<string, number>;
  avgMpg: number;
  rates: RateRow[];
}) {
  const { milesByJurisdiction, paidGallonsByJurisdiction, avgMpg, rates } = params;
  const jurisdictionIds = new Set<string>([
    ...milesByJurisdiction.keys(),
    ...paidGallonsByJurisdiction.keys(),
  ]);

  const rateMap = new Map<string, number>(
    rates.map((rate) => [rate.jurisdictionId, decimalToNumber(rate.taxRate)]),
  );

  const rows: JurisdictionAggregate[] = [];

  for (const jurisdictionId of jurisdictionIds) {
    const taxableMiles = round(milesByJurisdiction.get(jurisdictionId) ?? 0, 2);
    const taxableGallons = round(avgMpg > 0 ? taxableMiles / avgMpg : 0, 2);
    const paidGallons = round(paidGallonsByJurisdiction.get(jurisdictionId) ?? 0, 2);
    const netTaxableGallons = round(taxableGallons - paidGallons, 2);
    const taxRate = round(rateMap.get(jurisdictionId) ?? 0, 4);
    const taxDue = round(netTaxableGallons * taxRate, 2);

    rows.push({
      jurisdictionId,
      taxableMiles,
      taxableGallons,
      paidGallons,
      netTaxableGallons,
      taxRate,
      taxDue,
    });
  }

  return rows;
}

export async function recomputeIftaReport(reportId: string) {
  const report = await prisma.iftaReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      year: true,
      quarter: true,
      fuelType: true,
    },
  });

  if (!report) return null;

  const [tripMileages, fuelPurchases, rates, jurisdictions] = await Promise.all([
    prisma.tripMileage.findMany({
      where: {
        trip: {
          reportId: report.id,
        },
      },
      select: {
        jurisdictionId: true,
        miles: true,
      },
    }),
    prisma.fuelPurchase.findMany({
      where: {
        reportId: report.id,
        fuelType: report.fuelType,
      },
      select: {
        jurisdictionId: true,
        gallons: true,
      },
    }),
    prisma.iftaTaxRate.findMany({
      where: {
        year: report.year,
        quarter: report.quarter as Quarter,
        fuelType: report.fuelType as FuelType,
      },
      select: {
        jurisdictionId: true,
        taxRate: true,
      },
    }),
    prisma.jurisdiction.findMany({
      select: {
        id: true,
        code: true,
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const milesByJurisdiction = new Map<string, number>();
  let totalMiles = 0;
  for (const row of tripMileages) {
    const miles = decimalToNumber(row.miles);
    totalMiles += miles;
    milesByJurisdiction.set(
      row.jurisdictionId,
      (milesByJurisdiction.get(row.jurisdictionId) ?? 0) + miles,
    );
  }

  const paidGallonsByJurisdiction = new Map<string, number>();
  let totalGallons = 0;
  for (const row of fuelPurchases) {
    const gallons = decimalToNumber(row.gallons);
    totalGallons += gallons;
    paidGallonsByJurisdiction.set(
      row.jurisdictionId,
      (paidGallonsByJurisdiction.get(row.jurisdictionId) ?? 0) + gallons,
    );
  }

  totalMiles = round(totalMiles, 2);
  totalGallons = round(totalGallons, 2);
  const averageMpg = totalGallons > 0 ? round(totalMiles / totalGallons, 2) : 0;

  const aggregates = buildJurisdictionAggregates({
    milesByJurisdiction,
    paidGallonsByJurisdiction,
    avgMpg: averageMpg,
    rates,
  });

  const jurisdictionCodeMap = new Map(jurisdictions.map((j) => [j.id, j.code]));
  aggregates.sort((a, b) => {
    const codeA = jurisdictionCodeMap.get(a.jurisdictionId) ?? "";
    const codeB = jurisdictionCodeMap.get(b.jurisdictionId) ?? "";
    return codeA.localeCompare(codeB);
  });

  const totalTaxDue = round(
    aggregates.reduce((acc, row) => acc + row.taxDue, 0),
    2,
  );

  await prisma.$transaction(async (tx) => {
    await tx.iftaReportLine.deleteMany({
      where: { reportId: report.id },
    });

    if (aggregates.length > 0) {
      await tx.iftaReportLine.createMany({
        data: aggregates.map((row, index) => ({
          reportId: report.id,
          jurisdictionId: row.jurisdictionId,
          fuelType: report.fuelType,
          taxRate: toDecimalString(row.taxRate, 4),
          taxableMiles: toDecimalString(row.taxableMiles, 2),
          taxableGallons: toDecimalString(row.taxableGallons, 2),
          paidGallons: toDecimalString(row.paidGallons, 2),
          netTaxableGallons: toDecimalString(row.netTaxableGallons, 2),
          taxDue: toDecimalString(row.taxDue, 2),
          sortOrder: index,
        })),
      });
    }

    await tx.iftaReport.update({
      where: { id: report.id },
      data: {
        totalMiles: toDecimalString(totalMiles, 2),
        totalGallons: toDecimalString(totalGallons, 2),
        averageMpg: toDecimalString(averageMpg, 2),
        totalTaxDue: toDecimalString(totalTaxDue, 2),
      },
    });
  });

  return {
    reportId: report.id,
    totalMiles,
    totalGallons,
    averageMpg,
    totalTaxDue,
    lines: aggregates.length,
  };
}

export async function recomputeIftaReports(reportIds: Array<string | null | undefined>) {
  const unique = Array.from(new Set(reportIds.filter(Boolean) as string[]));
  for (const reportId of unique) {
    await recomputeIftaReport(reportId);
  }
}
