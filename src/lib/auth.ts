import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/redis";
import { z } from "zod";

const credentialSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const ip = clientIp(request.headers?.["x-forwarded-for"] ?? request.headers?.["x-real-ip"]);
        const [ipLimit, emailLimit] = await Promise.all([
          rateLimit([`login:ip:${ip}`], 20, 15 * 60),
          rateLimit([`login:user:${email}`], 8, 15 * 60),
        ]);
        if (!ipLimit.allowed || !emailLimit.allowed) return null;

        const user = await db.user.findUnique({
          where: { email },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
};
