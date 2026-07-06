import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { prisma, type User } from "@dat/db";
import { redis } from "../redis";

const DEV_USER = {
  email: process.env.DEV_USER_EMAIL ?? "gene@lancekey.com",
  name: process.env.DEV_USER_NAME ?? "Gene",
};

let cachedUser: User | null = null;

/** Single-user dev auth; Auth.js replaces this when multi-user lands. */
async function getCurrentUser(): Promise<User> {
  if (cachedUser) return cachedUser;
  cachedUser = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: DEV_USER,
  });
  return cachedUser;
}

export async function createTrpcContext() {
  const user = await getCurrentUser();
  return { prisma, redis, user };
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
