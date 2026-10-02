"use client";

import { fetchWithFreshAuth } from "@/lib/auth/freshAuthHeaders";
import type { ManagerPlace } from "@/lib/server/places/serialize";

export type { ManagerPlace };

export class PlaceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Browser calls to the Place manager APIs with a fresh bearer token. */
export async function placeApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithFreshAuth(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new PlaceApiError(body.error ?? "Something went wrong. Try again.", res.status, body.code);
  return body as T;
}

export function placeStatusLabel(place: Pick<ManagerPlace, "verification_status" | "listed">): string {
  if (place.verification_status === "verified") return place.listed ? "Verified · Listed" : "Verified · Not listed yet";
  if (place.verification_status === "suspended") return "Suspended";
  if (place.verification_status === "pending") return "Pending review";
  return "Draft";
}
