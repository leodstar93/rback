
import { requirePermission } from "@/lib/rbac-guard";
import DashboardPage from "./panel-client";
import { redirect } from "next/navigation";


export default async function DashboardServer() {

    const res = await requirePermission("dashboard:access");
    console.log("requirePermission result:", res);
    
     if (!res.ok) {
    redirect(res.reason === "UNAUTHENTICATED" ? "/login" : "/forbidden");
  }
  
  

  return <DashboardPage />;
}

