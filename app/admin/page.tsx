import { requirePermission } from "@/lib/rbac-guard";
import { redirect } from "next/navigation";
import AdminPageClient from "./admin-client";

export default async function AdminPage() {
  const res = await requirePermission("admin:access");
  console.log("requirePermission result:", res);

  if (!res.ok) {
    redirect(res.reason === "UNAUTHENTICATED" ? "/login" : "/forbidden");
  }

  return <AdminPageClient />;
}
