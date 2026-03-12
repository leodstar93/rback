import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

const GOOGLE_DEFAULT_ROLE_NAMES = ["TRUCKER", "USER"] as const;

async function ensureGoogleDefaultRoles(userId?: string, email?: string | null) {
  if (!userId && !email) return;

  const normalizedEmail = email ?? undefined;
  const dbUser = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, roles: { select: { roleId: true } } },
      })
    : normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, roles: { select: { roleId: true } } },
        })
      : null;

  if (!dbUser) return;
  if (dbUser.roles.length > 0) return;

  const defaultRoles = await prisma.role.findMany({
    where: { name: { in: [...GOOGLE_DEFAULT_ROLE_NAMES] } },
    select: { id: true },
  });

  if (defaultRoles.length === 0) return;

  await prisma.userRole.createMany({
    data: defaultRoles.map((role) => ({
      userId: dbUser.id,
      roleId: role.id,
    })),
    skipDuplicates: true,
  });
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        await ensureGoogleDefaultRoles(user.id as string | undefined, user.email);
      }

      // Handle account linking for existing users
      if (account && profile && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          include: { accounts: true },
        });

        if (existingUser) {
          // Check if this OAuth account is already linked
          const isLinked = existingUser.accounts.some(
            (acc) =>
              acc.provider === account.provider &&
              acc.providerAccountId === account.providerAccountId,
          );

          if (!isLinked) {
            // Link the OAuth account to the existing user
            await prisma.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                token_type: account.token_type,
                scope: account.scope,
                expires_at: account.expires_at,
                refresh_token: account.refresh_token,
                id_token: account.id_token,
                session_state: account.session_state
                  ? String(account.session_state)
                  : null,
              },
            });
          }

          return true;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      // En signIn, NextAuth puede traer user.id
      const userId = (user?.id as string) ?? (token.sub as string);
      if (!userId) return token;

      // Recarga desde DB cuando:
      // - primer login (user existe)
      // - o cuando llames session.update() (trigger === "update")
      if (user || trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            name: true, // ✅ IMPORTANTÍSIMO
            email: true,
            createdAt: true,
            roles: {
              select: {
                role: {
                  select: {
                    name: true,
                    permissions: {
                      select: { permission: { select: { key: true } } },
                    },
                  },
                },
              },
            },
          },
        });

        const roles = dbUser?.roles?.map((ur) => ur.role.name) ?? [];
        const permissions =
          dbUser?.roles?.flatMap((ur) =>
            (ur.role.permissions ?? []).map((rp) => rp.permission.key),
          ) ?? [];

        token.name = dbUser?.name ?? token.name; // ✅
        token.email = dbUser?.email ?? token.email; // ✅
        token.roles = roles;
        token.permissions = Array.from(new Set(permissions));
        token.createdAt = dbUser?.createdAt?.toISOString() ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      // expone en session.user
      (session.user as any).id = token.sub;
      (session.user as any).name = token.name;
      (session.user as any).email = token.email;
      (session.user as any).roles = (token as any).roles ?? [];
      (session.user as any).permissions = (token as any).permissions ?? [];
      (session.user as any).createdAt = (token as any).createdAt ?? null;
      return session;
    },
  },
});
