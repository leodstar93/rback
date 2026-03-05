import { auth } from "@/auth";

export type PermissionKey = string;

function hasWildcard(perms: string[], permission: string) {
  const mod = permission.split(":")[0];
  return perms.includes(`${mod}:manage`);
}

export async function getAuthz() {
  const session = await auth();
  const perms = ((session?.user as any)?.permissions ?? []) as string[];
  const roles = ((session?.user as any)?.roles ?? []) as string[];

  // Regla global: ADMIN lo puede todo
  const isAdmin = roles.includes("ADMIN");

  return { session, perms, roles, isAdmin };
}

export async function can(permission: PermissionKey) {
  const { session, perms, isAdmin } = await getAuthz();
  if (!session) return false;
  if (isAdmin) return true;
  return perms.includes(permission) || hasWildcard(perms, permission);
}