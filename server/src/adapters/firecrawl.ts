import {
  getFirecrawlCliPath,
  isFirecrawlConfigured,
  runFirecrawlCli,
  type FirecrawlCommandOptions
} from "../connectors/firecrawl.js";

export async function scrapeWithFirecrawlCli(
  url: string,
  args: string[] = [],
  options?: FirecrawlCommandOptions
) {
  return runFirecrawlCli(["scrape", url, ...args], options);
}

export async function crawlWithFirecrawlCli(
  url: string,
  args: string[] = [],
  options?: FirecrawlCommandOptions
) {
  return runFirecrawlCli(["crawl", url, ...args], options);
}

export async function mapWithFirecrawlCli(
  url: string,
  args: string[] = [],
  options?: FirecrawlCommandOptions
) {
  return runFirecrawlCli(["map", url, ...args], options);
}

export async function searchWithFirecrawlCli(
  query: string,
  args: string[] = [],
  options?: FirecrawlCommandOptions
) {
  return runFirecrawlCli(["search", query, ...args], options);
}

export async function downloadWithFirecrawlCli(
  url: string,
  args: string[] = [],
  options?: FirecrawlCommandOptions
) {
  return runFirecrawlCli(["download", url, ...args], options);
}

export const firecrawlCliAdapter = {
  id: "firecrawl-cli",
  cliPath: getFirecrawlCliPath,
  isConfigured: isFirecrawlConfigured,
  crawl: crawlWithFirecrawlCli,
  download: downloadWithFirecrawlCli,
  map: mapWithFirecrawlCli,
  run: runFirecrawlCli,
  scrape: scrapeWithFirecrawlCli,
  search: searchWithFirecrawlCli
} as const;
