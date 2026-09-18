export interface TelemetryEvent {
  id: string;
  taskId: string;
  executionId?: string;
  eventType: "TASK_CREATED" | "TASK_STARTED" | "TASK_COMPLETED" | "TASK_FAILED" | "EXECUTION_STARTED" | "EXECUTION_STEP" | "TOOL_CALL" | "VERIFICATION_STARTED" | "VERIFICATION_PASSED" | "VERIFICATION_FAILED" | "RETRY_STARTED";
  timestamp: Date;
  payload: Record<string, any>;
}

export interface TelemetryStore {
  saveEvent(event: TelemetryEvent): void;
  getEventsByTask(taskId: string): TelemetryEvent[];
}

export interface TelemetryEmitter {
  emit(event: Omit<TelemetryEvent, "id" | "timestamp">): void;
  subscribe(listener: (event: TelemetryEvent) => void): void;
}
