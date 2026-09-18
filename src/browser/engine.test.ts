import { describe, expect, it, beforeEach } from "vitest";
import { SafeBrowserEngine, MockBrowserProvider } from "./engine.js";

describe("SafeBrowserEngine", () => {
  let browser: SafeBrowserEngine;

  beforeEach(() => {
    browser = new SafeBrowserEngine(new MockBrowserProvider());
  });

  it("should navigate safely to public domains", async () => {
    const res = await browser.execute("navigate", { url: "https://example.com" }, "t1");
    expect(res).toBe("Navigated to https://example.com");
  });

  it("should block navigation to internal domains", async () => {
    await expect(browser.execute("navigate", { url: "http://127.0.0.1/admin" }, "t1"))
      .rejects.toThrow("SECURITY_VIOLATION: Navigation to internal or blocked domain");

    await expect(browser.execute("navigate", { url: "http://169.254.169.254/latest/meta-data/" }, "t1"))
      .rejects.toThrow("SECURITY_VIOLATION: Navigation to internal or blocked domain");
  });

  it("should block loopback/private variants beyond the exact original strings (RC2 hardening)", async () => {
    const blocked = [
      "http://127.0.0.2/x",            // loopback /8, not just .1
      "http://[::1]/x",                // IPv6 loopback literal
      "http://sub.localhost/x",        // localhost subdomain
      "http://LOCALHOST/x",            // case variant
      "http://localhost./x",           // trailing root dot
      "http://0.0.0.0/x",              // unspecified / "this network"
      "http://10.1.2.3/x",             // RFC1918
      "http://172.16.0.5/x",           // RFC1918
      "http://172.31.255.255/x",       // RFC1918 upper edge
      "http://192.168.1.5/x",          // RFC1918
      "http://169.254.0.1/x",          // link-local /8 range
      "http://2130706433/x",           // decimal IPv4 → canonical 127.0.0.1
      "http://[::ffff:127.0.0.1]/x",   // IPv4-mapped IPv6 (canonical hex form)
      "http://100.64.0.1/x",           // CGNAT RFC6598 lower edge
      "http://100.100.100.100/x",      // CGNAT (Tailscale-style)
      "http://100.127.255.254/x",      // CGNAT upper edge
    ];
    for (const url of blocked) {
      await expect(browser.execute("navigate", { url }, "t1"), url)
        .rejects.toThrow("SECURITY_VIOLATION: Navigation to internal or blocked domain");
    }
  });

  it("should still allow public domains after hardening", async () => {
    const res = await browser.execute("navigate", { url: "https://example.com/deep" }, "t1");
    expect(res).toBe("Navigated to https://example.com/deep");
  });

  it("should not over-block public ranges that merely look internal-adjacent (CGNAT boundary)", async () => {
    // 100.x outside the RFC6598 CGNAT range (100.64.0.0/10) is routable public space.
    const res = await browser.execute("navigate", { url: "http://100.43.0.1/x" }, "t1");
    expect(res).toBe("Navigated to http://100.43.0.1/x");
  });

  it("should perform other actions", async () => {
    const res = await browser.execute("extractContent", { selector: "h1" }, "t1");
    expect(res).toBe("Content for h1");
  });
});
