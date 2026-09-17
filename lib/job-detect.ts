// Detects a job posting on the current page via schema.org JobPosting JSON-LD
// (used by Greenhouse, Lever, Workday, SmartRecruiters, iCIMS, LinkedIn, and most
// other ATS platforms). No support for sites without structured data — Quick
// Capture simply doesn't trigger there and the popup falls back to Quick Update.

export interface DetectedJob {
  company: string;
  role: string;
  location: string | null;
  jobUrl: string;
}

export function detectJobPosting(doc: Document, url: string): DetectedJob | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const posting = findJobPosting(parsed);
    if (!posting) continue;

    const company = extractCompany(posting);
    const role = typeof posting.title === 'string' ? posting.title : null;
    if (company && role) {
      return { company, role, location: extractLocation(posting), jobUrl: url };
    }
  }
  return null;
}

function findJobPosting(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const isJobPosting = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
    if (isJobPosting) return obj;
    if (obj['@graph']) return findJobPosting(obj['@graph']);
  }
  return null;
}

function extractCompany(posting: Record<string, unknown>): string | null {
  const org = posting.hiringOrganization;
  if (typeof org === 'string') return org;
  if (org && typeof org === 'object') {
    const name = (org as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  return null;
}

function extractLocation(posting: Record<string, unknown>): string | null {
  let loc = posting.jobLocation;
  if (Array.isArray(loc)) loc = loc[0];
  if (loc && typeof loc === 'object') {
    const address = (loc as Record<string, unknown>).address;
    if (address && typeof address === 'object') {
      const a = address as Record<string, unknown>;
      const locality = typeof a.addressLocality === 'string' ? a.addressLocality : null;
      const region = typeof a.addressRegion === 'string' ? a.addressRegion : null;
      const parts = [locality, region].filter((v): v is string => Boolean(v));
      if (parts.length) return parts.join(', ');
      if (typeof a.addressCountry === 'string') return a.addressCountry;
    }
  }
  if (posting.jobLocationType === 'TELECOMMUTE') return 'Remote';
  return null;
}
