import { NextResponse } from "next/server";
import { getAuthz } from "./rbac";

export async function requireApiPermission(permission: string) {
    console.log("requireApiPermission called with permission:", permission);
  const { session, perms, isAdmin } = await getAuthz();

  if (!session) {
    return { ok: false as const, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const ok =
    isAdmin ||
    perms.includes(permission) ||
        perms.includes(`${permission.split(":")[0]}:manage`);
    console.log("requireApiPermission result:", { ok, session, perms, isAdmin });

  if (!ok) {
    return { ok: false as const, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, session, perms, isAdmin };
}

// Example usage in an API route
// export async function GET() {
//   const { ok, res } = await requireApiPermission("some:permission");
//   if (!ok) return res;
//   // Proceed with the rest of your API logic
// }

/* import { requireApiPermission } from "@/lib/rbac-api";

export async function POST() {
  const guard = await requireApiPermission("labslips:create");
  if (!guard.ok) return guard.res;

  // ... lógica
} */