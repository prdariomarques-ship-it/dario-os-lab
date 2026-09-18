import { Artifact, ArtifactStore } from "./types.js";
import { randomUUID } from "node:crypto";

export class ArtifactEngine {
  constructor(private store: ArtifactStore) {}

  createArtifact(taskId: string, executionId: string, type: Artifact["type"], name: string, location: string, sizeBytes?: number, checksum?: string): Artifact {
    const artifact: Artifact = {
      id: randomUUID(),
      taskId,
      executionId,
      type,
      name,
      location,
      sizeBytes,
      checksum,
      createdAt: new Date()
    };
    this.store.saveArtifact(artifact);
    return artifact;
  }

  getArtifact(id: string): Artifact | undefined {
    return this.store.getArtifact(id);
  }

  listArtifacts(taskId: string): Artifact[] {
    return this.store.listByTaskId(taskId);
  }
}
