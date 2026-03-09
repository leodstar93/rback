import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { requireApiPermission } from "@/lib/rbac-api";
import { randomBytes } from "crypto";
import { sendTemporaryPasswordEmail } from "@/lib/email";

function randomIndex(max: number) {
  return randomBytes(4).readUInt32BE(0) % max;
}

function generateTemporaryPassword(length = 14) {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%^&*";

  const groups = [lower, upper, numbers, symbols];
  const allChars = groups.join("");

  const chars: string[] = groups.map((group) => group[randomIndex(group.length)]);
  while (chars.length < length) {
    chars.push(allChars[randomIndex(allChars.length)]);
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ok, res } = await requireApiPermission("profile:write");
  if (!ok) return res;

  const session = await auth();
  const { id } = await params;

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Users can only change their own password, admins can change any password
  const isAdmin = session.user.roles?.includes("ADMIN");
  const isOwnPassword = session.user.id === id;

  if (!isAdmin && !isOwnPassword) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const mode = payload?.mode === "reset-and-email" ? "reset-and-email" : "change";

    const user = await prisma.user.findUnique({
      where: { id: id },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (mode === "reset-and-email") {
      if (!isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!user.email) {
        return Response.json(
          { error: "User does not have an email address" },
          { status: 400 },
        );
      }

      const temporaryPassword = generateTemporaryPassword();
      const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);

      await sendTemporaryPasswordEmail({
        to: user.email,
        name: user.name,
        temporaryPassword,
      });

      await prisma.user.update({
        where: { id: id },
        data: { passwordHash: temporaryPasswordHash },
      });

      return Response.json({
        message: "Temporary password generated and sent by email",
      });
    }

    const currentPassword = typeof payload?.currentPassword === "string"
      ? payload.currentPassword
      : "";
    const newPassword = typeof payload?.newPassword === "string"
      ? payload.newPassword
      : "";

    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 },
      );
    }

    // Verify current password (skip for admins changing other users' passwords)
    if (isOwnPassword && !isAdmin) {
      if (!user.passwordHash) {
        return Response.json(
          { error: "Account password not set. Please contact support." },
          { status: 400 },
        );
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );
      if (!isCurrentPasswordValid) {
        return Response.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: id },
      data: { passwordHash: newPasswordHash },
    });

    return Response.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    return Response.json({ error: "Failed to update password" }, { status: 500 });
  }
}
