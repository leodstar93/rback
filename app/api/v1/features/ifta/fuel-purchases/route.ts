import { NextRequest } from "next/server";
import { FuelType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac-api";
import { recomputeIftaReport } from "@/lib/ifta-report";

type CreateFuelPurchaseBody = {
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

export async function GET(request: NextRequest) {
  const guard = await requireApiPermission("ifta:read");
  if (!guard.ok) return guard.res;

  try {
    const reportId = request.nextUrl.searchParams.get("reportId");
    const where: Prisma.FuelPurchaseWhereInput = {
      userId: guard.session.user.id,
    };

    if (reportId) where.reportId = reportId;

    const fuelPurchases = await prisma.fuelPurchase.findMany({
      where,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
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

    return Response.json({ fuelPurchases });
  } catch (error) {
    console.error("Error fetching fuel purchases:", error);
    return Response.json(
      { error: "Failed to fetch fuel purchases" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireApiPermission("ifta:write");
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as CreateFuelPurchaseBody;
    const purchaseDate = parseDate(body.purchaseDate);
    if (!purchaseDate) {
      return Response.json({ error: "Invalid purchaseDate" }, { status: 400 });
    }

    const jurisdictionId =
      typeof body.jurisdictionId === "string" ? body.jurisdictionId.trim() : "";
    if (!jurisdictionId) {
      return Response.json({ error: "jurisdictionId is required" }, { status: 400 });
    }

    const fuelType = body.fuelType ? parseFuelType(body.fuelType) : FuelType.DI;
    if (!fuelType) {
      return Response.json({ error: "Invalid fuelType" }, { status: 400 });
    }

    const gallons = parseNumber(body.gallons, { min: 0.01 });
    if (gallons === null) {
      return Response.json({ error: "Invalid gallons" }, { status: 400 });
    }

    const pricePerGallon =
      typeof body.pricePerGallon === "undefined" || body.pricePerGallon === null
        ? null
        : parseNumber(body.pricePerGallon, { min: 0 });

    if (pricePerGallon === null && typeof body.pricePerGallon !== "undefined" && body.pricePerGallon !== null) {
      return Response.json({ error: "Invalid pricePerGallon" }, { status: 400 });
    }

    const totalAmountInput =
      typeof body.totalAmount === "undefined" || body.totalAmount === null
        ? null
        : parseNumber(body.totalAmount, { min: 0 });

    if (totalAmountInput === null && typeof body.totalAmount !== "undefined" && body.totalAmount !== null) {
      return Response.json({ error: "Invalid totalAmount" }, { status: 400 });
    }

    const jurisdiction = await prisma.jurisdiction.findUnique({
      where: { id: jurisdictionId },
      select: { id: true },
    });

    if (!jurisdiction) {
      return Response.json({ error: "Jurisdiction not found" }, { status: 404 });
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

    const totalAmount =
      totalAmountInput !== null
        ? totalAmountInput
        : pricePerGallon !== null
          ? gallons * pricePerGallon
          : null;

    const fuelPurchase = await prisma.fuelPurchase.create({
      data: {
        userId: ownerUserId,
        reportId,
        truckId,
        jurisdictionId: jurisdiction.id,
        purchaseDate,
        fuelType,
        gallons: gallons.toFixed(2),
        pricePerGallon: pricePerGallon?.toFixed(4) ?? null,
        totalAmount: totalAmount?.toFixed(2) ?? null,
        vendor: normalizeOptionalText(body.vendor),
        receiptNumber: normalizeOptionalText(body.receiptNumber),
        receiptUrl: normalizeOptionalText(body.receiptUrl),
      },
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

    if (fuelPurchase.reportId) {
      await recomputeIftaReport(fuelPurchase.reportId);
    }

    return Response.json(fuelPurchase, { status: 201 });
  } catch (error) {
    console.error("Error creating fuel purchase:", error);
    return Response.json(
      { error: "Failed to create fuel purchase" },
      { status: 500 },
    );
  }
}
