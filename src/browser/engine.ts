import { BrowserEngine, BrowserCapabilities } from "./types.js";

// Mock provider for the MVP until Playwright/Puppeteer is attached
export class MockBrowserProvider implements BrowserCapabilities {
  async navigate(url: string): Promise<string> {
    return `Navigated to ${url}`;
  }
  async inspect(): Promise<string> {
    return `<html><body>Mock Page</body></html>`;
  }
  async extractContent(selector: string): Promise<string> {
    return `Content for ${selector}`;
  }
  async click(selector: string): Promise<void> {}
  async type(selector: string, text: string): Promise<void> {}
  async screenshot(): Promise<Buffer> {
    return Buffer.from("mock_screenshot");
  }
}

// SSRF GUARD (RC2 hardening): the original guard compared the hostname
// against three exact strings, which any trivial variation defeated
// ("127.0.0.2", "[::1]", "sub.localhost", "0.0.0.0", RFC1918 ranges...).
// Node's WHATWG URL parser canonicalizes IPv4-ish hostnames (hex/octal/
// decimal forms like 0x7f000001 or 2130706433) before we see them, so a
// dotted-quad check after new URL() is sound. Known limitation (MVP): no
// DNS resolution — a hostname that RESOLVES to an internal IP but is not
// syntactically internal is not caught here.
function isBlockedIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n > 255) return false;
    octets.push(n);
  }
  const [a, b] = octets;
  if (a === 127) return true; // loopback /8 (127.0.0.1, 127.0.0.2, ...)
  if (a === 0) return true; // "this network" /8 incl. 0.0.0.0
  if (a === 10) return true; // RFC1918 private
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 private
  if (a === 192 && b === 168) return true; // RFC1918 private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT RFC6598 (carrier-grade NAT / mesh VPNs)
  return false;
}

function isBlockedHostname(rawHostname: string): boolean {
  let host = rawHostname.toLowerCase().trim();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // IPv6 literal
  if (host.endsWith(".")) host = host.slice(0, -1); // FQDN trailing root dot

  if (host === "localhost" || host.endsWith(".localhost")) return true;

  // IPv6 loopback / unspecified (canonical long form included)
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6 — Node canonicalizes "[::ffff:127.0.0.1]" to
  // "::ffff:7f00:1" (hex), so parse both the dotted and hex tail forms.
  if (host.startsWith("::ffff:")) {
    const tail = host.slice(7);
    if (tail.includes(".")) return isBlockedIPv4(tail);
    const groups = tail.split(":");
    if (groups.length === 2) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isBlockedIPv4(
          `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
        );
      }
    }
    return false;
  }

  return isBlockedIPv4(host);
}

export class SafeBrowserEngine implements BrowserEngine {
  constructor(private provider: BrowserCapabilities) {}

  async execute(action: string, params: any, taskId: string): Promise<any> {
    if (action === "navigate") {
       const url = new URL(params.url);
       if (isBlockedHostname(url.hostname)) {
         throw new Error("SECURITY_VIOLATION: Navigation to internal or blocked domain");
       }
       return await this.provider.navigate(params.url);
    }

    switch (action) {
      case "inspect":
        return await this.provider.inspect();
      case "extractContent":
        return await this.provider.extractContent(params.selector);
      case "click":
        await this.provider.click(params.selector);
        return "Clicked";
      case "type":
        await this.provider.type(params.selector, params.text);
        return "Typed";
      case "screenshot":
        return await this.provider.screenshot();
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
}
