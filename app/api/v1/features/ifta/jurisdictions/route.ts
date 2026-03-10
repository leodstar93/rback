import { NextRequest } from "next/server";
import { FuelType, Quarter } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";

function parseYear(value: string | null) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  if (year < 2000 || year > new Date().getFullYear() + 1) return null;
  return year;
}

function parseQuarter(value: string | null) {
  if (!value) return null;
  if (!Object.values(Quarter).includes(value as Quarter)) return null;
  return value as Quarter;
}

function parseFuelType(value: string | null) {
  if (!value) return null;
  if (!Object.values(FuelType).includes(value as FuelType)) return null;
  return value as FuelType;
}

export async function GET(request: NextRequest) {
  const guard = await requireApiPermission("ifta:read");
  if (!guard.ok) return guard.res;

  try {
    const year = parseYear(request.nextUrl.searchParams.get("year"));
    const quarter = parseQuarter(request.nextUrl.searchParams.get("quarter"));
    const fuelType = parseFuelType(request.nextUrl.searchParams.get("fuelType"));

    const jurisdictions = await prisma.jurisdiction.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!year || !quarter || !fuelType) {
      return Response.json({ jurisdictions });
    }

    const rates = await prisma.iftaTaxRate.findMany({
      where: {
        year,
        quarter,
        fuelType,
      },
      select: {
        jurisdictionId: true,
        taxRate: true,
      },
    });

    const rateMap = new Map(
      rates.map((row) => [row.jurisdictionId, Number(row.taxRate)]),
    );

    return Response.json({
      jurisdictions: jurisdictions.map((jurisdiction) => ({
        ...jurisdiction,
        taxRate: rateMap.get(jurisdiction.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("Error fetching jurisdictions:", error);
    return Response.json(
      { error: "Failed to fetch jurisdictions" },
      { status: 500 },
    );
  }
}
