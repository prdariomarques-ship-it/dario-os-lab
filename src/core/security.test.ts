import { describe, expect, it } from "vitest";
import { SafeBrowserEngine, MockBrowserProvider } from "../browser/engine.js";

describe("BROWSER SECURITY: Untrusted Page Hostile Instructions", () => {
  it("should prevent prompt-injected instructions from circumventing domain/policy blocks", async () => {
    // The SafeBrowserEngine evaluates purely on parameters, totally ignoring LLM context
    // Even if a malicious webpage forces the LLM to output:
    // TOOL_CALL: {"name": "navigate", "params": {"url": "http://169.254.169.254/latest/meta-data/"}}
    const provider = new MockBrowserProvider();
    const browser = new SafeBrowserEngine(provider);

    await expect(browser.execute("navigate", { url: "http://169.254.169.254/latest/meta-data/" }, "t1"))
      .rejects.toThrow("SECURITY_VIOLATION: Navigation to internal or blocked domain");
  });
});
