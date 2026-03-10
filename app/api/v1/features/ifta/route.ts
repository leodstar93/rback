import { NextRequest } from "next/server";
import { FuelType, Prisma, Quarter } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";

type CreateReportBody = {
  year?: unknown;
  quarter?: unknown;
  fuelType?: unknown;
  truckId?: unknown;
  notes?: unknown;
};

function parseYear(value: unknown) {
  const year = Number(value);
  if (!Number.isInteger(year)) return null;

  const currentYear = new Date().getFullYear() + 1;
  if (year < 2000 || year > currentYear) return null;

  return year;
}

function parseQuarter(value: unknown) {
  if (typeof value !== "string") return null;
  if (!Object.values(Quarter).includes(value as Quarter)) return null;
  return value as Quarter;
}

function parseFuelType(value: unknown) {
  if (typeof value !== "string") return null;
  if (!Object.values(FuelType).includes(value as FuelType)) return null;
  return value as FuelType;
}

function normalizeNotes(value: unknown) {
  if (typeof value !== "string") return null;
  const notes = value.trim();
  return notes.length ? notes : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireApiPermission("ifta:read");
  if (!guard.ok) return guard.res;

  try {
    const url = request.nextUrl;
    const queryYear = url.searchParams.get("year");
    const queryQuarter = url.searchParams.get("quarter");
    const queryFuelType = url.searchParams.get("fuelType");

    const where: Prisma.IftaReportWhereInput = {
      userId: guard.session.user.id,
    };

    if (queryYear !== null) {
      const year = parseYear(queryYear);
      if (year === null) {
        return Response.json({ error: "Invalid year" }, { status: 400 });
      }
      where.year = year;
    }

    if (queryQuarter !== null) {
      const quarter = parseQuarter(queryQuarter);
      if (!quarter) {
        return Response.json({ error: "Invalid quarter" }, { status: 400 });
      }
      where.quarter = quarter;
    }

    if (queryFuelType !== null) {
      const fuelType = parseFuelType(queryFuelType);
      if (!fuelType) {
        return Response.json({ error: "Invalid fuel type" }, { status: 400 });
      }
      where.fuelType = fuelType;
    }

    const [reports, trucks, jurisdictions] = await Promise.all([
      prisma.iftaReport.findMany({
        where,
        include: {
          truck: {
            select: {
              id: true,
              unitNumber: true,
              plateNumber: true,
            },
          },
          _count: {
            select: {
              lines: true,
              trips: true,
              fuelPurchases: true,
            },
          },
        },
        orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
      }),
      prisma.truck.findMany({
        where: { userId: guard.session.user.id },
        select: {
          id: true,
          unitNumber: true,
          plateNumber: true,
          vin: true,
        },
        orderBy: { unitNumber: "asc" },
      }),
      prisma.jurisdiction.findMany({
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { code: "asc" },
      }),
    ]);

    return Response.json({ reports, trucks, jurisdictions });
  } catch (error) {
    console.error("Error fetching IFTA reports:", error);
    return Response.json(
      { error: "Failed to fetch IFTA reports" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireApiPermission("ifta:write");
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as CreateReportBody;

    const year = parseYear(body.year);
    const quarter = parseQuarter(body.quarter);
    const fuelType = body.fuelType ? parseFuelType(body.fuelType) : FuelType.DI;

    if (year === null) {
      return Response.json({ error: "Invalid year" }, { status: 400 });
    }

    if (!quarter) {
      return Response.json({ error: "Invalid quarter" }, { status: 400 });
    }

    if (!fuelType) {
      return Response.json({ error: "Invalid fuel type" }, { status: 400 });
    }

    let truckId: string | null = null;
    if (typeof body.truckId === "string" && body.truckId.trim().length > 0) {
      const truck = await prisma.truck.findFirst({
        where: {
          id: body.truckId,
          userId: guard.session.user.id,
        },
        select: { id: true },
      });

      if (!truck) {
        return Response.json({ error: "Truck not found" }, { status: 404 });
      }
      truckId = truck.id;
    }

    const report = await prisma.iftaReport.create({
      data: {
        userId: guard.session.user.id,
        year,
        quarter,
        fuelType,
        truckId,
        notes: normalizeNotes(body.notes),
      },
      include: {
        truck: {
          select: {
            id: true,
            unitNumber: true,
            plateNumber: true,
          },
        },
        _count: {
          select: {
            lines: true,
            trips: true,
            fuelPurchases: true,
          },
        },
      },
    });

    return Response.json(report, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "A report already exists for that period and truck" },
        { status: 409 },
      );
    }

    console.error("Error creating IFTA report:", error);
    return Response.json(
      { error: "Failed to create IFTA report" },
      { status: 500 },
    );
  }
}
