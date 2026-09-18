import { Task } from "../core/types.js";

export interface VerificationResult {
  passed: boolean;
  reason?: string;
  evidence?: Record<string, unknown>;
}

export type VerificationType = "FILE_EXISTS" | "SCHEMA_MATCH" | "EXACT_TEXT" | "CUSTOM";

export interface VerificationCriteria {
  type: VerificationType;
  value: any;
  customVerifierId?: string;
}

export interface VerificationEngine {
  verify(task: Task, agentResult: string): Promise<VerificationResult>;
  registerCustomVerifier?(id: string, verifier: (task: Task, result: string) => Promise<VerificationResult>): void;
}
