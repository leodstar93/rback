import { redirect } from "next/navigation";
import { getAuthz } from "./rbac";

export async function requirePermission(permission: string) {
    const { session, perms, isAdmin } = await getAuthz();
    
    console.log("Session in requirePermission:", session, perms, isAdmin);

  if (!session) {
    return { ok: false as const, reason: "UNAUTHENTICATED" as const };
  }

  const ok =
    isAdmin ||
    perms.includes(permission) ||
    perms.includes(`${permission.split(":")[0]}:manage`);

  if (!ok) {
    return { ok: false as const, reason: "FORBIDDEN" as const };
  }

  return { ok: true as const, session, perms, isAdmin };
}

// Example usage in a page component
// export default async function DashboardPage() {
//   await requirePermission("dashboard:view", { loginTo: "/login", forbiddenTo: "/forbidden" });
//   // ... rest of your page logic
// }

/*
import { requirePermission } from "@/lib/rbac-guard";

export default async function UsersPage() {
  await requirePermission("users:read");
  return <div>Users</div>;
}
  */