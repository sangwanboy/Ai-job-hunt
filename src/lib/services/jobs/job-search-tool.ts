import { env } from "@/lib/config/env";

export type JobSearchParams = {
  keywords: string;
  location: string;
  resultsPerPage?: number;
};

export type JobSearchResult = {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  postedDate: string;
  description: string;
};

type AdzunaListing = {
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  redirect_url?: string;
  created?: string;
  description?: string;
};

type AdzunaResponse = {
  results?: AdzunaListing[];
};

function buildFallbackResults(params: JobSearchParams): JobSearchResult[] {
  const count = Math.min(20, Math.max(1, params.resultsPerPage ?? 8));
  return Array.from({ length: count }, (_, index) => ({
    title: `${params.keywords} ${index + 1}`,
    company: ["Northstar AI", "Orbit Cloud", "Helio Systems", "Arcwave Labs", "Quantum Horizon", "Nebula Forge"][index % 6],
    location: params.location,
    salary: "GBP 75,000-110,000",
    url: `https://example.com/jobs/${encodeURIComponent(params.keywords.toLowerCase().replace(/\s+/g, "-"))}-${index + 1}`,
    postedDate: new Date(Date.now() - index * 86400000).toISOString(),
    description: `[IMPORTANT] This is a illustrative placeholder result. Live job search is currently using fallback data because ADZUNA_APP_ID/KEY are not configured in your .env. Role: ${params.keywords} in ${params.location}.`,
  }));
}

function normalizeSalary(listing: AdzunaListing): string {
  if (typeof listing.salary_min === "number" && typeof listing.salary_max === "number") {
    return `GBP ${Math.round(listing.salary_min).toLocaleString()}-${Math.round(listing.salary_max).toLocaleString()}`;
  }
  if (typeof listing.salary_min === "number") {
    return `GBP ${Math.round(listing.salary_min).toLocaleString()}+`;
  }
  if (typeof listing.salary_max === "number") {
    return `Up to GBP ${Math.round(listing.salary_max).toLocaleString()}`;
  }
  return "Not listed";
}

export async function searchJobs(params: JobSearchParams): Promise<JobSearchResult[]> {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_API_KEY) {
    return buildFallbackResults(params);
  }

  const resultsPerPage = Math.min(20, Math.max(1, params.resultsPerPage ?? 8));
  const url = new URL("https://api.adzuna.com/v1/api/jobs/gb/search/1");
  url.searchParams.set("app_id", env.ADZUNA_APP_ID);
  url.searchParams.set("app_key", env.ADZUNA_API_KEY);
  url.searchParams.set("what", params.keywords);
  url.searchParams.set("where", params.location);
  url.searchParams.set("results_per_page", String(resultsPerPage));

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Adzuna request failed: ${response.status}. ${message.slice(0, 300)}`);
    }

    const payload = (await response.json()) as AdzunaResponse;
    return (payload.results ?? []).map((listing) => ({
      title: listing.title?.trim() || "Untitled role",
      company: listing.company?.display_name?.trim() || "Unknown company",
      location: listing.location?.display_name?.trim() || params.location,
      salary: normalizeSalary(listing),
      url: listing.redirect_url?.trim() || "",
      postedDate: listing.created?.trim() || new Date().toISOString(),
      description: listing.description?.trim() || "No description available.",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Adzuna error";
    throw new Error(`Live job search failed: ${message}`);
  }
}
