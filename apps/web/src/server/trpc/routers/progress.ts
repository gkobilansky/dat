import { z } from "zod";
import { progressChannel, type AgentProgressEvent } from "@dat/shared";
import { createRedisSubscriber } from "../../redis";
import { publicProcedure, router } from "../init";

export const progressRouter = router({
  onCaseProgress: publicProcedure
    .input(z.object({ caseId: z.string() }))
    .subscription(async function* ({ input, signal }): AsyncGenerator<AgentProgressEvent> {
      const subscriber = createRedisSubscriber();
      const queue: AgentProgressEvent[] = [];
      let wake: (() => void) | null = null;

      subscriber.on("message", (_channel: string, raw: string) => {
        try {
          queue.push(JSON.parse(raw) as AgentProgressEvent);
        } catch {
          return;
        }
        wake?.();
      });
      await subscriber.subscribe(progressChannel(input.caseId));

      try {
        while (!signal?.aborted) {
          while (queue.length > 0) {
            yield queue.shift()!;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
          wake = null;
        }
      } finally {
        subscriber.disconnect();
      }
    }),
});
