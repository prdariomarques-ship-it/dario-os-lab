import { describe, expect, it, beforeEach } from "vitest";
import { SQLiteArtifactStore } from "./sqlite.js";
import { Artifact } from "./types.js";

describe("SQLiteArtifactStore", () => {
  let store: SQLiteArtifactStore;

  beforeEach(() => {
    store = new SQLiteArtifactStore();
  });

  const dummyArtifact: Artifact = {
    id: "art-1",
    taskId: "task-1",
    executionId: "exec-1",
    type: "FILE",
    name: "output.txt",
    location: "/tmp/output.txt",
    sizeBytes: 1024,
    checksum: "sha256-hash",
    createdAt: new Date()
  };

  it("should save and retrieve an artifact", () => {
    store.saveArtifact(dummyArtifact);
    const retrieved = store.getArtifact("art-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("output.txt");
  });

  it("should list artifacts by task id", () => {
    store.saveArtifact(dummyArtifact);
    store.saveArtifact({
      ...dummyArtifact,
      id: "art-2",
      name: "second.txt"
    });

    const list = store.listByTaskId("task-1");
    expect(list.length).toBe(2);
  });
});
