import { EventEmitter } from "events";
import { logger } from "../utils/logger";

export type EventMap = {
  "contract.signed": { contractId: string };
  "contract.cancelled": { contractId: string };
  "installation.activated": { installationId: string; contractId: string };
  "solution.version.updated": { solutionId: string; versionId: string };
  "bonus.calculated": { userId: string; period: string; amountCents: number };
  "payment.created": { paymentId: string; userId: string };
};

class TypedEmitter {
  private bus = new EventEmitter();

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.bus.emit(event, payload);
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>
  ): void {
    this.bus.on(event, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event, payload }, "Event handler failed");
      }
    });
  }
}

export const events = new TypedEmitter();
