import dns from 'dns';
import net from 'net';

/**
 * Checks if an IPv4 address is in private, loopback, or reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP treated as unsafe
  }

  const [a, b] = parts;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 10.0.0.0/8 - Private Class A
  if (a === 10) return true;

  // 172.16.0.0/12 - Private Class B (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 - Private Class C
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 - Link-Local / Cloud Metadata (169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 - Current network
  if (a === 0) return true;

  // 100.64.0.0/10 - Carrier-grade NAT
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Checks if an IPv6 address is loopback, unique local, or link-local.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // Unique local fc00::/7
  if (lower.startsWith('fe80:')) return true; // Link-local fe80::/10
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6
    const ipv4Part = lower.replace('::ffff:', '');
    if (net.isIPv4(ipv4Part)) return isPrivateIPv4(ipv4Part);
  }
  return false;
}

export interface ValidationResult {
  safe: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Validates and normalizes a target URL against SSRF and unsafe protocols.
 */
export async function validateSafeUrl(rawUrl: string): Promise<ValidationResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, error: 'URL must be a non-empty string.' };
  }

  let trimmed = rawUrl.trim();
  // If no scheme at all (e.g., "example.com" or "wikipedia.org"), default to https://
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, error: 'Invalid URL format.' };
  }

  // Protocol check: only http and https allowed
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: `Protocol "${parsed.protocol}" is not allowed. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { safe: false, error: 'Hostname cannot be empty.' };
  }

  // Block localhost aliases and local domains
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.corp') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { safe: false, error: 'Navigation to localhost or internal network endpoints is blocked for security.' };
  }

  // Restricted port validation: block dangerous non-HTTP services
  const DANGEROUS_PORTS = new Set([
    21, 22, 23, 25, 53, 69, 110, 135, 137, 138, 139, 143, 389, 445, 1433,
    1521, 2049, 3306, 3389, 5432, 5900, 6379, 8000, 9200, 10000, 11211, 27017
  ]);
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  if (DANGEROUS_PORTS.has(port)) {
    return { safe: false, error: `Port ${port} is restricted to prevent unauthorized service access (blocked for security).` };
  }

  // Direct IP literal checks
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      return { safe: false, error: 'Direct access to private or loopback IPv4 addresses is blocked.' };
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      return { safe: false, error: 'Direct access to private or loopback IPv6 addresses is blocked.' };
    }
  } else {
    // Domain name: resolve IP to protect against DNS rebinding to internal network
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (addr.family === 4 && isPrivateIPv4(addr.address)) {
          return { safe: false, error: 'Domain resolves to a private or restricted network address.' };
        }
        if (addr.family === 6 && isPrivateIPv6(addr.address)) {
          return { safe: false, error: 'Domain resolves to a private or restricted IPv6 address.' };
        }
      }
    } catch (err: any) {
      // If DNS resolution fails, allow navigation to attempt in browser or return error
      if (err.code === 'ENOTFOUND') {
        return { safe: false, error: `Domain "${hostname}" could not be resolved.` };
      }
    }
  }

  return { safe: true, normalizedUrl: parsed.href };
}
