/**
 * @file Interface contract and formatting utilities for Captain's Log changelog entries.
 * @module models/changelog
 */

export interface ChangelogEntry {
  /** Canonical ISO-8601 date string (YYYY-MM-DD). */
  date: string;
  /** Optional semver or release tag identifier. */
  version?: string;
  /** List of change bullets for this update. */
  changes: string[];
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into canonical display format (e.g. "19 February 2021").
 * Uses UTC parsing to prevent timezone day shifts across locales.
 *
 * @param isoDate - ISO-8601 date string (YYYY-MM-DD).
 * @returns Formatted date string in English (e.g. "19 February 2021").
 */
export function formatChangelogDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
