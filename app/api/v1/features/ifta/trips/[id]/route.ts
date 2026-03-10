import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";
import { recomputeIftaReports } from "@/lib/ifta-report";

type MileageInput = {
  jurisdictionId?: unknown;
  miles?: unknown;
};

type UpdateTripBody = {
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

  return Array.from(merged.entries()).map(([jurisdictionId, miles]) => ({
    jurisdictionId,
    miles: Number(miles.toFixed(2)),
  }));
}

async function getTripWithRelations(id: string) {
  return prisma.trip.findUnique({
    where: { id },
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  const guard = await requireApiPermission("ifta:read");
  if (!guard.ok) return guard.res;

  const { id } = await params;

  try {
    const trip = await getTripWithRelations(id);

    if (!trip) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    if (!guard.isAdmin && trip.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(trip);
  } catch (error) {
    console.error("Error fetching trip:", error);
    return Response.json({ error: "Failed to fetch trip" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApiPermission("ifta:write");
  if (!guard.ok) return guard.res;

  const { id } = await params;

  try {
    const existing = await prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reportId: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as UpdateTripBody;

    let reportId: string | null | undefined;
    if (typeof body.reportId !== "undefined") {
      if (body.reportId === null || body.reportId === "") {
        reportId = null;
      } else if (typeof body.reportId === "string") {
        const report = await prisma.iftaReport.findUnique({
          where: { id: body.reportId.trim() },
          select: {
            id: true,
            userId: true,
          },
        });

        if (!report) {
          return Response.json({ error: "Report not found" }, { status: 404 });
        }

        if (report.userId !== existing.userId) {
          return Response.json(
            { error: "Report belongs to a different user" },
            { status: 400 },
          );
        }

        reportId = report.id;
      } else {
        return Response.json({ error: "Invalid reportId" }, { status: 400 });
      }
    }

    let truckId: string | null | undefined;
    if (typeof body.truckId !== "undefined") {
      if (body.truckId === null || body.truckId === "") {
        truckId = null;
      } else if (typeof body.truckId === "string") {
        const truck = await prisma.truck.findFirst({
          where: {
            id: body.truckId.trim(),
            userId: existing.userId,
          },
          select: { id: true },
        });

        if (!truck) {
          return Response.json({ error: "Truck not found" }, { status: 404 });
        }

        truckId = truck.id;
      } else {
        return Response.json({ error: "Invalid truckId" }, { status: 400 });
      }
    }

    let tripDate: Date | undefined;
    if (typeof body.tripDate !== "undefined") {
      const parsedDate = parseDate(body.tripDate);
      if (!parsedDate) {
        return Response.json({ error: "Invalid tripDate" }, { status: 400 });
      }
      tripDate = parsedDate;
    }

    const data: Prisma.TripUncheckedUpdateInput = {};
    if (typeof reportId !== "undefined") data.reportId = reportId;
    if (typeof truckId !== "undefined") data.truckId = truckId;
    if (typeof tripDate !== "undefined") data.tripDate = tripDate;
    if (typeof body.origin !== "undefined") data.origin = normalizeOptionalText(body.origin);
    if (typeof body.destination !== "undefined") {
      data.destination = normalizeOptionalText(body.destination);
    }
    if (typeof body.notes !== "undefined") data.notes = normalizeOptionalText(body.notes);

    const hasMileageUpdate = typeof body.mileages !== "undefined";
    const mileageRows = hasMileageUpdate ? parseMileageRows(body.mileages) : null;

    if (hasMileageUpdate && mileageRows === null) {
      return Response.json({ error: "Invalid mileages" }, { status: 400 });
    }

    if (hasMileageUpdate && mileageRows && mileageRows.length > 0) {
      const jurisdictionIds = mileageRows.map((row) => row.jurisdictionId);
      const jurisdictions = await prisma.jurisdiction.findMany({
        where: { id: { in: jurisdictionIds } },
        select: { id: true },
      });
      if (jurisdictions.length !== new Set(jurisdictionIds).size) {
        return Response.json(
          { error: "Invalid jurisdiction in mileages" },
          { status: 400 },
        );
      }
    }

    if (hasMileageUpdate && mileageRows) {
      const totalMiles = mileageRows.reduce((acc, row) => acc + row.miles, 0);
      data.totalMiles = totalMiles.toFixed(2);
    }

    await prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: existing.id },
        data,
      });

      if (hasMileageUpdate) {
        await tx.tripMileage.deleteMany({
          where: { tripId: existing.id },
        });

        if (mileageRows && mileageRows.length > 0) {
          await tx.tripMileage.createMany({
            data: mileageRows.map((row) => ({
              tripId: existing.id,
              jurisdictionId: row.jurisdictionId,
              miles: row.miles.toFixed(2),
            })),
          });
        }
      }
    });

    const updated = await getTripWithRelations(existing.id);
    if (!updated) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    await recomputeIftaReports([existing.reportId, updated.reportId]);

    return Response.json(updated);
  } catch (error) {
    console.error("Error updating trip:", error);
    return Response.json({ error: "Failed to update trip" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  const guard = await requireApiPermission("ifta:write");
  if (!guard.ok) return guard.res;

  const { id } = await params;

  try {
    const existing = await prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reportId: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.trip.delete({
      where: { id: existing.id },
    });

    await recomputeIftaReports([existing.reportId]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting trip:", error);
    return Response.json({ error: "Failed to delete trip" }, { status: 500 });
  }
}
