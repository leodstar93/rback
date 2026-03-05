import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NextRequest } from "next/server";

// DELETE - Remove a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify the document belongs to the user
    const document = await prisma.document.findUnique({
      where: { id: params.id },
    });

    if (!document) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.userId !== session.user.id) {
      // Only admins can delete other users' documents
      const isAdmin = session.user.roles?.includes("ADMIN");
      if (!isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Delete the document
    await prisma.document.delete({
      where: { id: params.id },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return Response.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
