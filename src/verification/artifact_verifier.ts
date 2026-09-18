import { VerificationEngine, VerificationResult } from "./types.js";
import { Task } from "../core/types.js";
import { ArtifactEngine } from "../artifacts/engine.js";

// A wrapper or extension for VerificationEngine that also validates constraints against persisted artifacts.
export class ArtifactAwareVerifier implements VerificationEngine {
  constructor(private baseVerifier: VerificationEngine, private artifactEngine: ArtifactEngine) {}

  async verify(task: Task, result: string): Promise<VerificationResult> {
    const baseResult = await this.baseVerifier.verify(task, result);
    if (!baseResult.passed) return baseResult;

    // Check if task metadata mandates artifact creation
    if (task.metadata?.requiredArtifactType) {
      const artifacts = this.artifactEngine.listArtifacts(task.id);
      const hasRequired = artifacts.some(a => a.type === task.metadata?.requiredArtifactType);
      if (!hasRequired) {
        return { passed: false, reason: `Task requires artifact of type ${task.metadata.requiredArtifactType}, but none was created.` };
      }
    }

    return { passed: true };
  }
}
