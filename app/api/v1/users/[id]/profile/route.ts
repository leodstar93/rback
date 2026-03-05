import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/rbac-api";

// UPDATE user profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

    const { ok, res } = await requireApiPermission("profile:write");
    if (!ok) return res;
  // Proceed with the rest of your API logic
    const session = await auth();
    const { id } = await params;
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Users can only update their own profile, admins can update any profile
  const isAdmin = session.user.roles?.includes("ADMIN");
  const isOwnProfile = session.user.id === id;

  if (!isOwnProfile) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
      const { name } = await request.json();
      console.log("Updating user profile:", { id, name });
        
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json(
        { error: "Name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { name: name.trim() },
      include: {
        roles: {
          include: {
            role: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
      console.log("Updated user profile:", updatedUser);
    return Response.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return Response.json({ error: "Failed to update user" }, { status: 500 });
  }
}