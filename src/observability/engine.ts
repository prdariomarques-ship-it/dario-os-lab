import { randomUUID } from "node:crypto";
import { TelemetryEmitter, TelemetryEvent, TelemetryStore } from "./types.js";

export class SimpleTelemetryEmitter implements TelemetryEmitter {
  private listeners: Array<(event: TelemetryEvent) => void> = [];

  constructor(private store?: TelemetryStore) {}

  emit(eventObj: Omit<TelemetryEvent, "id" | "timestamp">): void {
    const event: TelemetryEvent = {
      ...eventObj,
      id: randomUUID(),
      timestamp: new Date()
    };

    if (this.store) {
      this.store.saveEvent(event);
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("Telemetry listener failed:", e);
      }
    }
  }

  subscribe(listener: (event: TelemetryEvent) => void): void {
    this.listeners.push(listener);
  }
}
