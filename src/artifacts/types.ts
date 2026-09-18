export interface Artifact {
  id: string;
  taskId: string;
  executionId: string;
  type: "FILE" | "SCREENSHOT" | "REPORT" | "JSON";
  name: string;
  location: string;
  sizeBytes?: number;
  checksum?: string;
  createdAt: Date;
}

export interface ArtifactStore {
  saveArtifact(artifact: Artifact): void;
  getArtifact(id: string): Artifact | undefined;
  listByTaskId(taskId: string): Artifact[];
  deleteArtifact(id: string): void;
}
