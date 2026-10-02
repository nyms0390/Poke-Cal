import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
export const DEFAULT_FETCH_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

export function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function hasFlag(argv, flag) {
  return argv.includes(flag);
}

export function isMainModule(moduleUrl, argv = process.argv) {
  return Boolean(argv[1]) && moduleUrl === pathToFileURL(argv[1]).href;
}

export async function readJson(directory, name) {
  return JSON.parse(await readFile(new URL(`${name}.json`, directory), "utf8"));
}

// Reads a JSON file, returning `undefined` when it does not exist (e.g. no baseline yet).
export async function readJsonIfExists(directory, name) {
  try {
    return await readJson(directory, name);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

// Reads every generated catalog in a directory as `{ pokemon, abilities, moves, items, teams }`,
// the shape `src/data/catalog-validation.js` expects. Missing files are `undefined`.
export async function readCatalogs(directory) {
  const [pokemon, abilities, moves, items, teams] = await Promise.all(
    ["pokemon", "abilities", "moves", "items", "limitless-teams"].map((name) =>
      readJsonIfExists(directory, name),
    ),
  );
  return { pokemon, abilities, moves, items, teams };
}

export async function writeJson(directory, name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${name}.json`, directory), formattedJson(data));
}

export async function writeJsonEntries(directory, entries) {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(entries).map(([name, data]) =>
      writeFile(new URL(`${name}.json`, directory), formattedJson(data)),
    ),
  );
}

function formattedJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export class FetchError extends Error {
  constructor(message, { status, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "FetchError";
    this.status = status;
    this.retryable = retryable;
  }
}

// Shared upstream fetch for every sync script: per-attempt timeout (AbortSignal.timeout),
// bounded retries with exponential backoff for network errors, timeouts, 429 and 5xx, and
// rejection of non-OK responses and of HTML pages where JSON/TS/JS/CSV is expected (an error
// page or captive portal must never be parsed as data).
//
// `expect`: "text" (default; any non-HTML text), "json" (parsed JSON is returned), or "html"
// (directory listings such as the Smogon stats index; HTML is allowed).
export async function fetchWithRetry(
  url,
  {
    expect = "text",
    headers,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retries = DEFAULT_FETCH_RETRIES,
    baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    fetchImpl = globalThis.fetch,
    sleep = delay,
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      lastError = new FetchError(`Failed to fetch ${url}: ${networkErrorMessage(error)}`, {
        retryable: true,
        cause: error,
      });
      if (attempt < retries) await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new FetchError(`Failed to fetch ${url}: HTTP ${response.status}`, {
        status: response.status,
        retryable,
      });
      await discardBody(response);
      if (!retryable) throw lastError;
      if (attempt < retries) await sleep(retryDelay(response, attempt, baseDelayMs));
      continue;
    }

    let body;
    try {
      body = await response.text();
    } catch (error) {
      lastError = new FetchError(`Failed to read ${url}: ${networkErrorMessage(error)}`, {
        retryable: true,
        cause: error,
      });
      if (attempt < retries) await sleep(backoffDelay(attempt, baseDelayMs));
      continue;
    }

    if (expect !== "html" && (isHtmlContentType(response) || looksLikeHtml(body))) {
      throw new FetchError(`Expected ${expect} from ${url} but received an HTML page.`, {
        status: response.status,
      });
    }
    if (expect === "json") {
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new FetchError(`Invalid JSON from ${url}: ${error.message}`, {
          status: response.status,
          cause: error,
        });
      }
    }
    return body;
  }
  throw lastError;
}

export function fetchText(url, options = {}) {
  return fetchWithRetry(url, { ...options, expect: options.expect ?? "text" });
}

export function fetchJson(url, options = {}) {
  return fetchWithRetry(url, { ...options, expect: "json" });
}

export function looksLikeHtml(text) {
  const start = String(text ?? "")
    .replace(/^﻿/, "")
    .trimStart()
    .slice(0, 256)
    .toLowerCase();
  return (
    start.startsWith("<!doctype html") || start.startsWith("<html") || start.startsWith("<head")
  );
}

// Honors Retry-After (seconds) and the IETF `RateLimit: ...;t=<seconds>` header used by
// Limitless, otherwise exponential backoff.
export function retryDelay(response, attempt, baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS) {
  const retryAfterHeader = response.headers?.get?.("retry-after");
  const retryAfter =
    retryAfterHeader === null || retryAfterHeader === undefined || retryAfterHeader === ""
      ? Number.NaN
      : Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS);
  }
  const resetSeconds = Number(
    /(?:^|;\s*)t=(\d+)/.exec(response.headers?.get?.("ratelimit") ?? "")?.[1],
  );
  if (Number.isFinite(resetSeconds) && resetSeconds >= 0) {
    return Math.min((resetSeconds + 1) * 1000, MAX_RETRY_DELAY_MS);
  }
  return backoffDelay(attempt, baseDelayMs);
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffDelay(attempt, baseDelayMs) {
  return Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function isHtmlContentType(response) {
  return /\btext\/html\b/i.test(response.headers?.get?.("content-type") ?? "");
}

async function discardBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Ignore: the body is irrelevant for a failed response.
  }
}

function networkErrorMessage(error) {
  if (error?.name === "TimeoutError") return "request timed out";
  if (error?.name === "AbortError") return "request aborted";
  return error?.cause?.code ?? error?.message ?? String(error);
}
