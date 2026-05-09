// Lightweight User-Agent parser. Not exhaustive — covers ~99% of real-world
// browsers without pulling in a dependency. Returns null for fields it can't
// confidently identify so the dashboard can show "Unknown".

export type ParsedUA = {
  device: "mobile" | "tablet" | "desktop" | null;
  browser: string | null;
  os: string | null;
};

export function parseUA(ua: string | null): ParsedUA {
  if (!ua) return { device: null, browser: null, os: null };

  const isTablet = /iPad|Tablet|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = !isTablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry/i.test(ua);
  const device: ParsedUA["device"] = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  // Browser detection — order matters. Edge and Opera include "Chrome" in their UA;
  // Chrome includes "Safari"; check the more specific tokens first.
  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera\//.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  else if (/MSIE|Trident\//.test(ua)) browser = "Internet Explorer";
  else browser = "Other";

  let os: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  else os = "Other";

  return { device, browser, os };
}

// Vercel URL-encodes some edge headers (city) for non-ASCII safety.
export function decodeEdgeHeader(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
