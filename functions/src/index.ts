import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

export const signalScout = onSchedule("every 6 hours", async () => {
  logger.info("Signal Scout: placeholder — pipeline not yet implemented");
});
