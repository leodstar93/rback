import { NextRequest } from "next/server";
import { FuelType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";
import { recomputeIftaReports } from "@/lib/ifta-report";

type UpdateFuelPurchaseBody = {
  reportId?: unknown;
  truckId?: unknown;
  jurisdictionId?: unknown;
  purchaseDate?: unknown;
  fuelType?: unknown;
  gallons?: unknown;
  pricePerGallon?: unknown;
  totalAmount?: unknown;
  vendor?: unknown;
  receiptNumber?: unknown;
  receiptUrl?: unknown;
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

function parseNumber(value: unknown, options?: { min?: number }) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (typeof options?.min === "number" && num < options.min) return null;
  return num;
}

function parseFuelType(value: unknown) {
  if (typeof value !== "string") return null;
  if (!Object.values(FuelType).includes(value as FuelType)) return null;
  return value as FuelType;
}

async function getFuelPurchaseWithRelations(id: string) {
  return prisma.fuelPurchase.findUnique({
    where: { id },
    include: {
      jurisdiction: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
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
    const fuelPurchase = await getFuelPurchaseWithRelations(id);
    if (!fuelPurchase) {
      return Response.json({ error: "Fuel purchase not found" }, { status: 404 });
    }

    if (!guard.isAdmin && fuelPurchase.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json(fuelPurchase);
  } catch (error) {
    console.error("Error fetching fuel purchase:", error);
    return Response.json(
      { error: "Failed to fetch fuel purchase" },
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
    const existing = await prisma.fuelPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reportId: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Fuel purchase not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as UpdateFuelPurchaseBody;
    const data: Prisma.FuelPurchaseUncheckedUpdateInput = {};

    if (typeof body.purchaseDate !== "undefined") {
      const purchaseDate = parseDate(body.purchaseDate);
      if (!purchaseDate) {
        return Response.json({ error: "Invalid purchaseDate" }, { status: 400 });
      }
      data.purchaseDate = purchaseDate;
    }

    if (typeof body.fuelType !== "undefined") {
      const fuelType = parseFuelType(body.fuelType);
      if (!fuelType) {
        return Response.json({ error: "Invalid fuelType" }, { status: 400 });
      }
      data.fuelType = fuelType;
    }

    if (typeof body.gallons !== "undefined") {
      const gallons = parseNumber(body.gallons, { min: 0.01 });
      if (gallons === null) {
        return Response.json({ error: "Invalid gallons" }, { status: 400 });
      }
      data.gallons = gallons.toFixed(2);
    }

    if (typeof body.pricePerGallon !== "undefined") {
      if (body.pricePerGallon === null || body.pricePerGallon === "") {
        data.pricePerGallon = null;
      } else {
        const pricePerGallon = parseNumber(body.pricePerGallon, { min: 0 });
        if (pricePerGallon === null) {
          return Response.json({ error: "Invalid pricePerGallon" }, { status: 400 });
        }
        data.pricePerGallon = pricePerGallon.toFixed(4);
      }
    }

    if (typeof body.totalAmount !== "undefined") {
      if (body.totalAmount === null || body.totalAmount === "") {
        data.totalAmount = null;
      } else {
        const totalAmount = parseNumber(body.totalAmount, { min: 0 });
        if (totalAmount === null) {
          return Response.json({ error: "Invalid totalAmount" }, { status: 400 });
        }
        data.totalAmount = totalAmount.toFixed(2);
      }
    }

    if (typeof body.jurisdictionId !== "undefined") {
      if (typeof body.jurisdictionId !== "string" || body.jurisdictionId.trim().length === 0) {
        return Response.json({ error: "Invalid jurisdictionId" }, { status: 400 });
      }
      const jurisdiction = await prisma.jurisdiction.findUnique({
        where: { id: body.jurisdictionId.trim() },
        select: { id: true },
      });
      if (!jurisdiction) {
        return Response.json({ error: "Jurisdiction not found" }, { status: 404 });
      }
      data.jurisdictionId = jurisdiction.id;
    }

    if (typeof body.reportId !== "undefined") {
      if (body.reportId === null || body.reportId === "") {
        data.reportId = null;
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

        data.reportId = report.id;
      } else {
        return Response.json({ error: "Invalid reportId" }, { status: 400 });
      }
    }

    if (typeof body.truckId !== "undefined") {
      if (body.truckId === null || body.truckId === "") {
        data.truckId = null;
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
        data.truckId = truck.id;
      } else {
        return Response.json({ error: "Invalid truckId" }, { status: 400 });
      }
    }

    if (typeof body.vendor !== "undefined") {
      data.vendor = normalizeOptionalText(body.vendor);
    }
    if (typeof body.receiptNumber !== "undefined") {
      data.receiptNumber = normalizeOptionalText(body.receiptNumber);
    }
    if (typeof body.receiptUrl !== "undefined") {
      data.receiptUrl = normalizeOptionalText(body.receiptUrl);
    }

    const updated = await prisma.fuelPurchase.update({
      where: { id: existing.id },
      data,
    });

    const normalized =
      typeof updated.totalAmount === "string" ? Number(updated.totalAmount) : updated.totalAmount;

    if (
      (typeof body.totalAmount === "undefined" || body.totalAmount === null || body.totalAmount === "") &&
      updated.pricePerGallon !== null &&
      updated.gallons !== null
    ) {
      const gallons = Number(updated.gallons);
      const price = Number(updated.pricePerGallon);
      const computed = Number((gallons * price).toFixed(2));
      if (!Number.isFinite(normalized ?? NaN) || normalized !== computed) {
        await prisma.fuelPurchase.update({
          where: { id: existing.id },
          data: {
            totalAmount: computed.toFixed(2),
          },
        });
      }
    }

    const record = await getFuelPurchaseWithRelations(existing.id);
    if (!record) {
      return Response.json({ error: "Fuel purchase not found" }, { status: 404 });
    }

    await recomputeIftaReports([existing.reportId, record.reportId]);

    return Response.json(record);
  } catch (error) {
    console.error("Error updating fuel purchase:", error);
    return Response.json(
      { error: "Failed to update fuel purchase" },
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
    const existing = await prisma.fuelPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        reportId: true,
      },
    });

    if (!existing) {
      return Response.json({ error: "Fuel purchase not found" }, { status: 404 });
    }

    if (!guard.isAdmin && existing.userId !== guard.session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.fuelPurchase.delete({
      where: { id: existing.id },
    });

    await recomputeIftaReports([existing.reportId]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting fuel purchase:", error);
    return Response.json(
      { error: "Failed to delete fuel purchase" },
      { status: 500 },
    );
  }
}
