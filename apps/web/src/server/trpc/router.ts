import { publicProcedure, router } from "./init";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
});

export type AppRouter = typeof appRouter;
