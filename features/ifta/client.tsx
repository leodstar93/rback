"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
type FuelType = "DI" | "GA";
type ReportStatus = "DRAFT" | "FILED" | "AMENDED";

type Report = {
  id: string;
  year: number;
  quarter: Quarter;
  fuelType: FuelType;
  status: ReportStatus;
  totalMiles: string;
  totalGallons: string;
  totalTaxDue: string;
  _count: { lines: number; trips: number; fuelPurchases: number };
};

type Truck = { id: string; unitNumber: string; plateNumber: string | null; vin: string | null };
type Jurisdiction = { id: string; code: string; name: string };
type Trip = { id: string; tripDate: string; totalMiles: string | null; report: Report | null };
type FuelPurchase = {
  id: string;
  purchaseDate: string;
  gallons: string;
  fuelType: FuelType;
  totalAmount: string | null;
  jurisdiction: Jurisdiction;
  report: Report | null;
};

type Toast = { id: string; type: "success" | "error"; title: string; message?: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatNumber(value: string | number) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(value: string | number) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function reportLabel(report: Pick<Report, "year" | "quarter" | "fuelType">) {
  return `${report.year} ${report.quarter} ${report.fuelType}`;
}

export default function IftaClientPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [fuelPurchases, setFuelPurchases] = useState<FuelPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportQuarter, setReportQuarter] = useState<Quarter>("Q1");
  const [reportFuelType, setReportFuelType] = useState<FuelType>("DI");

  const [truckUnitNumber, setTruckUnitNumber] = useState("");
  const [truckPlateNumber, setTruckPlateNumber] = useState("");

  const [tripDate, setTripDate] = useState(new Date().toISOString().slice(0, 10));
  const [tripReportId, setTripReportId] = useState("");
  const [tripTruckId, setTripTruckId] = useState("");
  const [tripJurisdictionId, setTripJurisdictionId] = useState("");
  const [tripMiles, setTripMiles] = useState("");

  const [fuelDate, setFuelDate] = useState(new Date().toISOString().slice(0, 10));
  const [fuelReportId, setFuelReportId] = useState("");
  const [fuelTruckId, setFuelTruckId] = useState("");
  const [fuelJurisdictionId, setFuelJurisdictionId] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("DI");
  const [fuelGallons, setFuelGallons] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");

  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (toast: Omit<Toast, "id">) => {
    const id = uid();
    setToasts((prev) => [{ id, ...toast }, ...prev]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [baseRes, tripsRes, fuelRes, jurisdictionRes] = await Promise.all([
        fetch("/api/v1/features/ifta", { cache: "no-store" }),
        fetch("/api/v1/features/ifta/trips", { cache: "no-store" }),
        fetch("/api/v1/features/ifta/fuel-purchases", { cache: "no-store" }),
        fetch("/api/v1/features/ifta/jurisdictions", { cache: "no-store" }),
      ]);
      if (!baseRes.ok || !tripsRes.ok || !fuelRes.ok || !jurisdictionRes.ok) {
        throw new Error("Unable to load IFTA data");
      }

      const base = await baseRes.json();
      const tripsData = await tripsRes.json();
      const fuelData = await fuelRes.json();
      const jurisdictionData = await jurisdictionRes.json();

      setReports(base.reports || []);
      setTrucks(base.trucks || []);
      setTrips(tripsData.trips || []);
      setFuelPurchases(fuelData.fuelPurchases || []);
      const list = (base.jurisdictions || jurisdictionData.jurisdictions || []) as Jurisdiction[];
      setJurisdictions(list);
      if (!tripJurisdictionId && list[0]) setTripJurisdictionId(list[0].id);
      if (!fuelJurisdictionId && list[0]) setFuelJurisdictionId(list[0].id);
    } catch (error) {
      pushToast({
        type: "error",
        title: "Load failed",
        message: error instanceof Error ? error.message : "Could not fetch IFTA data.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const totals = useMemo(() => {
    return {
      miles: reports.reduce((acc, r) => acc + Number(r.totalMiles || 0), 0),
      gallons: reports.reduce((acc, r) => acc + Number(r.totalGallons || 0), 0),
      taxDue: reports.reduce((acc, r) => acc + Number(r.totalTaxDue || 0), 0),
    };
  }, [reports]);

  const postJson = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Request failed");
    }
  };

  const updateReportStatus = async (reportId: string, nextStatus: ReportStatus) => {
    const res = await fetch(`/api/v1/features/ifta/${reportId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update report status");
    }
  };

  const deleteById = async (url: string) => {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Delete failed");
    }
  };

  if (status === "loading" || loading) {
    return <div className="rounded-2xl border bg-white p-6">Loading IFTA module...</div>;
  }
  if (!session?.user) return null;

  return (
    <div className="space-y-6">
      <div className="pointer-events-none fixed right-4 top-4 z-60 flex w-[92vw] max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-2xl border bg-white p-4 shadow-lg">
            <p className="text-sm font-semibold text-zinc-900">{toast.title}</p>
            {toast.message && <p className="mt-1 text-sm text-zinc-600">{toast.message}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">IFTA Summary</h2>
          <button onClick={() => void fetchAll()} className="rounded-xl border px-3 py-2 text-sm">
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Reports: {reports.length}</div>
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Trucks: {trucks.length}</div>
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Trips: {trips.length}</div>
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Fuel: {fuelPurchases.length}</div>
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Miles: {formatNumber(totals.miles)}</div>
          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">Tax: {formatCurrency(totals.taxDue)}</div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Create Report</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await postJson("/api/v1/features/ifta", {
                year: reportYear,
                quarter: reportQuarter,
                fuelType: reportFuelType,
              });
              await fetchAll();
              pushToast({ type: "success", title: "Report created" });
            } catch (error) {
              pushToast({
                type: "error",
                title: "Report create failed",
                message: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }}
        >
          <input type="number" value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} className="rounded-xl border px-3 py-2 text-sm" />
          <select value={reportQuarter} onChange={(e) => setReportQuarter(e.target.value as Quarter)} className="rounded-xl border px-3 py-2 text-sm"><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option></select>
          <select value={reportFuelType} onChange={(e) => setReportFuelType(e.target.value as FuelType)} className="rounded-xl border px-3 py-2 text-sm"><option value="DI">Diesel</option><option value="GA">Gasoline</option></select>
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white">Create</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Trucks</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await postJson("/api/v1/features/ifta/trucks", {
                unitNumber: truckUnitNumber,
                plateNumber: truckPlateNumber || null,
              });
              setTruckUnitNumber("");
              setTruckPlateNumber("");
              await fetchAll();
              pushToast({ type: "success", title: "Truck created" });
            } catch (error) {
              pushToast({
                type: "error",
                title: "Truck create failed",
                message: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }}
        >
          <input value={truckUnitNumber} onChange={(e) => setTruckUnitNumber(e.target.value)} placeholder="Unit number" className="rounded-xl border px-3 py-2 text-sm" />
          <input value={truckPlateNumber} onChange={(e) => setTruckPlateNumber(e.target.value)} placeholder="Plate number" className="rounded-xl border px-3 py-2 text-sm" />
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white">Add Truck</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Add Trip</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await postJson("/api/v1/features/ifta/trips", {
                reportId: tripReportId || null,
                truckId: tripTruckId || null,
                tripDate,
                mileages: [{ jurisdictionId: tripJurisdictionId, miles: Number(tripMiles) }],
              });
              setTripMiles("");
              await fetchAll();
              pushToast({ type: "success", title: "Trip created" });
            } catch (error) {
              pushToast({
                type: "error",
                title: "Trip create failed",
                message: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }}
        >
          <select value={tripReportId} onChange={(e) => setTripReportId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">No report</option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>{reportLabel(report)}</option>
            ))}
          </select>
          <select value={tripTruckId} onChange={(e) => setTripTruckId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">No truck</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>
            ))}
          </select>
          <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
          <select value={tripJurisdictionId} onChange={(e) => setTripJurisdictionId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            {jurisdictions.map((jurisdiction) => (
              <option key={jurisdiction.id} value={jurisdiction.id}>
                {jurisdiction.code} - {jurisdiction.name}
              </option>
            ))}
          </select>
          <input type="number" min={0} step={0.01} value={tripMiles} onChange={(e) => setTripMiles(e.target.value)} placeholder="Miles" className="rounded-xl border px-3 py-2 text-sm" />
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white">Add Trip</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Add Fuel Purchase</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await postJson("/api/v1/features/ifta/fuel-purchases", {
                reportId: fuelReportId || null,
                truckId: fuelTruckId || null,
                purchaseDate: fuelDate,
                jurisdictionId: fuelJurisdictionId,
                fuelType,
                gallons: Number(fuelGallons),
                pricePerGallon: fuelPrice ? Number(fuelPrice) : null,
              });
              setFuelGallons("");
              setFuelPrice("");
              await fetchAll();
              pushToast({ type: "success", title: "Fuel purchase created" });
            } catch (error) {
              pushToast({
                type: "error",
                title: "Fuel create failed",
                message: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }}
        >
          <select value={fuelReportId} onChange={(e) => setFuelReportId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">No report</option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>{reportLabel(report)}</option>
            ))}
          </select>
          <select value={fuelTruckId} onChange={(e) => setFuelTruckId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">No truck</option>
            {trucks.map((truck) => (
              <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>
            ))}
          </select>
          <input type="date" value={fuelDate} onChange={(e) => setFuelDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
          <select value={fuelJurisdictionId} onChange={(e) => setFuelJurisdictionId(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            {jurisdictions.map((jurisdiction) => (
              <option key={jurisdiction.id} value={jurisdiction.id}>
                {jurisdiction.code} - {jurisdiction.name}
              </option>
            ))}
          </select>
          <input type="number" min={0} step={0.01} value={fuelGallons} onChange={(e) => setFuelGallons(e.target.value)} placeholder="Gallons" className="rounded-xl border px-3 py-2 text-sm" />
          <input type="number" min={0} step={0.0001} value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} placeholder="Price/gal" className="rounded-xl border px-3 py-2 text-sm" />
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)} className="rounded-xl border px-3 py-2 text-sm"><option value="DI">Diesel</option><option value="GA">Gasoline</option></select>
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white">Add Fuel</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-900">Recent Records</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Trucks</p>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              {trucks.slice(0, 5).map((truck) => (
                <li key={truck.id} className="rounded-xl border p-2">
                  <p>{truck.unitNumber}</p>
                  <button
                    onClick={async () => {
                      try {
                        await deleteById(`/api/v1/features/ifta/trucks/${truck.id}`);
                        await fetchAll();
                        pushToast({ type: "success", title: "Truck deleted" });
                      } catch (error) {
                        pushToast({
                          type: "error",
                          title: "Truck delete failed",
                          message: error instanceof Error ? error.message : "Unknown error",
                        });
                      }
                    }}
                    className="mt-2 rounded-lg border px-2 py-1 text-xs"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">Reports</p>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              {reports.slice(0, 5).map((report) => (
                <li key={report.id} className="rounded-xl border p-2">
                  <p>{reportLabel(report)} - Tax {formatCurrency(report.totalTaxDue)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={report.status}
                      onChange={async (e) => {
                        try {
                          await updateReportStatus(report.id, e.target.value as ReportStatus);
                          await fetchAll();
                        } catch (error) {
                          pushToast({
                            type: "error",
                            title: "Status update failed",
                            message: error instanceof Error ? error.message : "Unknown error",
                          });
                        }
                      }}
                      className="rounded-lg border px-2 py-1 text-xs"
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="FILED">FILED</option>
                      <option value="AMENDED">AMENDED</option>
                    </select>
                    <button
                      onClick={async () => {
                        try {
                          await deleteById(`/api/v1/features/ifta/${report.id}`);
                          await fetchAll();
                          pushToast({ type: "success", title: "Report deleted" });
                        } catch (error) {
                          pushToast({
                            type: "error",
                            title: "Report delete failed",
                            message: error instanceof Error ? error.message : "Unknown error",
                          });
                        }
                      }}
                      className="rounded-lg border px-2 py-1 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">Trips</p>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              {trips.slice(0, 5).map((trip) => (
                <li key={trip.id} className="rounded-xl border p-2">
                  <p>
                    {trip.report ? reportLabel(trip.report) : "No report"} - {formatDate(trip.tripDate)} - {formatNumber(trip.totalMiles || 0)} mi
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await deleteById(`/api/v1/features/ifta/trips/${trip.id}`);
                        await fetchAll();
                        pushToast({ type: "success", title: "Trip deleted" });
                      } catch (error) {
                        pushToast({
                          type: "error",
                          title: "Trip delete failed",
                          message: error instanceof Error ? error.message : "Unknown error",
                        });
                      }
                    }}
                    className="mt-2 rounded-lg border px-2 py-1 text-xs"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">Fuel</p>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              {fuelPurchases.slice(0, 5).map((item) => (
                <li key={item.id} className="rounded-xl border p-2">
                  <p>{item.jurisdiction.code} - {formatDate(item.purchaseDate)} - {formatNumber(item.gallons)} gal</p>
                  <button
                    onClick={async () => {
                      try {
                        await deleteById(`/api/v1/features/ifta/fuel-purchases/${item.id}`);
                        await fetchAll();
                        pushToast({ type: "success", title: "Fuel purchase deleted" });
                      } catch (error) {
                        pushToast({
                          type: "error",
                          title: "Fuel delete failed",
                          message: error instanceof Error ? error.message : "Unknown error",
                        });
                      }
                    }}
                    className="mt-2 rounded-lg border px-2 py-1 text-xs"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
