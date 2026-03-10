import { NextRequest } from "next/server";
import { FuelType, Prisma, Quarter, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";
import { recomputeIftaReport } from "@/lib/ifta-report";

type UpdateReportBody = {
  year?: unknown;
  quarter?: unknown;
  fuelType?: unknown;
  truckId?: unknown;
  status?: unknown;
  filedAt?: unknown;
  notes?: unknown;
};

function parseYear(value: unknown) {
  if (typeof value === "undefined") return undefined;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;

  const maxYear = new Date().getFullYear() + 1;
  if (year < 2000 || year > maxYear) return null;

  return year;
}

function parseQuarter(value: unknown) {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "string") return null;
  if (!Object.values(Quarter).includes(value as Quarter)) return null;
  return value as Quarter;
}

function parseFuelType(value: unknown) {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "string") return null;
  if (!Object.values(FuelType).includes(value as FuelType)) return null;
  return value as FuelType;
}

function parseStatus(value: unknown) {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "string") return null;
  if (!Object.values(ReportStatus).includes(value as ReportStatus)) return null;
  return value as ReportStatus;
}

function parseNotes(value: unknown) {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;

  const notes = value.trim();
  return notes.length ? notes : null;
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
    const report = await prisma.iftaReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        truck: {
          select: {
            id: true,
            unitNumber: true,
            plateNumber: true,
            vin: true,
          },
        },
        lines: {
          include: {
            jurisdiction: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        trips: {
          include: {
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
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { tripDate: "asc" },
        },
        fuelPurchases: {
          include: {
            jurisdiction: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: { purchaseDate: "asc" },
        },
      },
    });

    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    if (!guard.isAdmin && report.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(report);
  } catch (error) {
    console.error("Error fetching IFTA report detail:", error);
    return Response.json(
      { error: "Failed to fetch IFTA report detail" },
      { status: 500 },
    );
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
    const existing = await prisma.iftaReport.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as UpdateReportBody;

    const year = parseYear(body.year);
    const quarter = parseQuarter(body.quarter);
    const fuelType = parseFuelType(body.fuelType);
    const status = parseStatus(body.status);
    const notes = parseNotes(body.notes);

    if (year === null) return Response.json({ error: "Invalid year" }, { status: 400 });
    if (quarter === null) {
      return Response.json({ error: "Invalid quarter" }, { status: 400 });
    }
    if (fuelType === null) {
      return Response.json({ error: "Invalid fuel type" }, { status: 400 });
    }
    if (status === null) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    let truckId: string | null | undefined = undefined;
    if (typeof body.truckId !== "undefined") {
      if (body.truckId === null || body.truckId === "") {
        truckId = null;
      } else if (typeof body.truckId === "string") {
        const truck = await prisma.truck.findFirst({
          where: {
            id: body.truckId,
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

    let filedAt: Date | null | undefined = undefined;
    if (typeof body.filedAt !== "undefined") {
      if (body.filedAt === null || body.filedAt === "") {
        filedAt = null;
      } else if (typeof body.filedAt === "string") {
        const date = new Date(body.filedAt);
        if (Number.isNaN(date.getTime())) {
          return Response.json({ error: "Invalid filedAt" }, { status: 400 });
        }
        filedAt = date;
      } else {
        return Response.json({ error: "Invalid filedAt" }, { status: 400 });
      }
    }

    const nextStatus = status ?? existing.status;
    if (typeof filedAt === "undefined" && nextStatus === ReportStatus.FILED) {
      filedAt = new Date();
    }

    const data: Prisma.IftaReportUncheckedUpdateInput = {};

    if (typeof year !== "undefined") data.year = year;
    if (typeof quarter !== "undefined") data.quarter = quarter;
    if (typeof fuelType !== "undefined") data.fuelType = fuelType;
    if (typeof truckId !== "undefined") data.truckId = truckId;
    if (typeof status !== "undefined") data.status = status;
    if (typeof filedAt !== "undefined") data.filedAt = filedAt;
    if (typeof notes !== "undefined") data.notes = notes;

    await prisma.iftaReport.update({
      where: { id },
      data,
    });

    await recomputeIftaReport(id);

    const updated = await prisma.iftaReport.findUnique({
      where: { id },
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

    if (!updated) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    return Response.json(updated);
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

    console.error("Error updating IFTA report:", error);
    return Response.json(
      { error: "Failed to update IFTA report" },
      { status: 500 },
    );
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
    const existing = await prisma.iftaReport.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.iftaReport.delete({
      where: { id },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting IFTA report:", error);
    return Response.json(
      { error: "Failed to delete IFTA report" },
      { status: 500 },
    );
  }
}
