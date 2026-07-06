import { publicProcedure, router } from "./init";
import { caseRouter } from "./routers/case";
import { fileRouter } from "./routers/file";
import { messageRouter } from "./routers/message";
import { progressRouter } from "./routers/progress";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  case: caseRouter,
  file: fileRouter,
  message: messageRouter,
  progress: progressRouter,
});

export type AppRouter = typeof appRouter;
