import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";
import { recomputeIftaReport } from "@/lib/ifta-report";

type MileageInput = {
  jurisdictionId?: unknown;
  miles?: unknown;
};

type CreateTripBody = {
  reportId?: unknown;
  truckId?: unknown;
  tripDate?: unknown;
  origin?: unknown;
  destination?: unknown;
  notes?: unknown;
  mileages?: unknown;
};

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length ? text : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseMiles(value: unknown) {
  const miles = Number(value);
  if (!Number.isFinite(miles) || miles < 0) return null;
  return miles;
}

function parseMileageRows(value: unknown) {
  if (!Array.isArray(value)) return null;

  const merged = new Map<string, number>();
  for (const row of value as MileageInput[]) {
    if (!row || typeof row !== "object") return null;
    const jurisdictionId =
      typeof row.jurisdictionId === "string" ? row.jurisdictionId.trim() : "";
    const miles = parseMiles(row.miles);

    if (!jurisdictionId || miles === null) return null;
    merged.set(jurisdictionId, (merged.get(jurisdictionId) ?? 0) + miles);
  }

  if (merged.size === 0) return [];

  return Array.from(merged.entries()).map(([jurisdictionId, miles]) => ({
    jurisdictionId,
    miles: Number(miles.toFixed(2)),
  }));
}

export async function GET(request: NextRequest) {
  const guard = await requireApiPermission("ifta:read");
  if (!guard.ok) return guard.res;

  try {
    const reportId = request.nextUrl.searchParams.get("reportId");

    const where: Prisma.TripWhereInput = {
      userId: guard.session.user.id,
    };

    if (reportId) where.reportId = reportId;

    const trips = await prisma.trip.findMany({
      where,
      orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
      include: {
        truck: {
          select: {
            id: true,
            unitNumber: true,
            plateNumber: true,
          },
        },
        report: {
          select: {
            id: true,
            year: true,
            quarter: true,
            fuelType: true,
          },
        },
        mileages: {
          include: {
            jurisdiction: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [{ jurisdiction: { code: "asc" } }],
        },
      },
    });

    return Response.json({ trips });
  } catch (error) {
    console.error("Error fetching trips:", error);
    return Response.json({ error: "Failed to fetch trips" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireApiPermission("ifta:write");
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as CreateTripBody;
    const tripDate = parseDate(body.tripDate);

    if (!tripDate) {
      return Response.json({ error: "Invalid tripDate" }, { status: 400 });
    }

    const mileageRows = parseMileageRows(body.mileages);
    if (mileageRows === null || mileageRows.length === 0) {
      return Response.json(
        { error: "At least one mileage entry is required" },
        { status: 400 },
      );
    }

    const reportId =
      typeof body.reportId === "string" && body.reportId.trim().length > 0
        ? body.reportId.trim()
        : null;

    let ownerUserId = guard.session.user.id;

    if (reportId) {
      const report = await prisma.iftaReport.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!report) {
        return Response.json({ error: "Report not found" }, { status: 404 });
      }

      if (!guard.isAdmin && report.userId !== guard.session.user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      ownerUserId = report.userId;
    }

    let truckId: string | null = null;
    if (typeof body.truckId === "string" && body.truckId.trim().length > 0) {
      const truck = await prisma.truck.findFirst({
        where: {
          id: body.truckId.trim(),
          userId: ownerUserId,
        },
        select: { id: true },
      });

      if (!truck) {
        return Response.json({ error: "Truck not found" }, { status: 404 });
      }

      truckId = truck.id;
    }

    const jurisdictionIds = mileageRows.map((row) => row.jurisdictionId);
    const jurisdictions = await prisma.jurisdiction.findMany({
      where: {
        id: { in: jurisdictionIds },
      },
      select: { id: true },
    });

    if (jurisdictions.length !== new Set(jurisdictionIds).size) {
      return Response.json({ error: "Invalid jurisdiction in mileages" }, { status: 400 });
    }

    const totalMiles = mileageRows.reduce((acc, row) => acc + row.miles, 0);

    const trip = await prisma.trip.create({
      data: {
        userId: ownerUserId,
        reportId,
        truckId,
        tripDate,
        origin: normalizeOptionalText(body.origin),
        destination: normalizeOptionalText(body.destination),
        notes: normalizeOptionalText(body.notes),
        totalMiles: totalMiles.toFixed(2),
        mileages: {
          create: mileageRows.map((row) => ({
            jurisdictionId: row.jurisdictionId,
            miles: row.miles.toFixed(2),
          })),
        },
      },
      include: {
        truck: {
          select: {
            id: true,
            unitNumber: true,
            plateNumber: true,
          },
        },
        report: {
          select: {
            id: true,
            year: true,
            quarter: true,
            fuelType: true,
          },
        },
        mileages: {
          include: {
            jurisdiction: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [{ jurisdiction: { code: "asc" } }],
        },
      },
    });

    if (trip.reportId) {
      await recomputeIftaReport(trip.reportId);
    }

    return Response.json(trip, { status: 201 });
  } catch (error) {
    console.error("Error creating trip:", error);
    return Response.json({ error: "Failed to create trip" }, { status: 500 });
  }
}
