import { requirePermission } from "@/lib/rbac-guard";
import { redirect } from "next/navigation";
import ProfilePage from "./profile-client";

export default async function AdminPage() {
  const res = await requirePermission("profile:access");
  console.log("requirePermission result:", res);

  if (!res.ok) {
    redirect(res.reason === "UNAUTHENTICATED" ? "/login" : "/forbidden");
  }

  return <ProfilePage />;
}
