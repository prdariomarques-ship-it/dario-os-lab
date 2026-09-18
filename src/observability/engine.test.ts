import { describe, expect, it, vi } from "vitest";
import { SimpleTelemetryEmitter } from "./engine.js";

describe("SimpleTelemetryEmitter", () => {
  it("should generate id, timestamp and notify listeners", () => {
    const emitter = new SimpleTelemetryEmitter();
    const listener = vi.fn();

    emitter.subscribe(listener);
    emitter.emit({ taskId: "t1", eventType: "TASK_CREATED", payload: { a: 1 } });

    expect(listener).toHaveBeenCalled();
    const event = listener.mock.calls[0][0];
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.taskId).toBe("t1");
  });
});
