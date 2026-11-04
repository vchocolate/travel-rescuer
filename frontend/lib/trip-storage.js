export const TRIP_ID_STORAGE_KEY = "travel-rescuer:trip_id";
export const TRIP_ID_QUERY_KEY = "trip_id";

function validTripId(value) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function readTripIdFromUrl(urlValue) {
  if (typeof window === "undefined" && !urlValue) return null;
  const currentUrl = new URL(
    urlValue || window.location.href,
    "http://localhost",
  );
  return validTripId(currentUrl.searchParams.get(TRIP_ID_QUERY_KEY));
}

export function readTripIdFromStorage() {
  if (typeof window === "undefined") return null;
  return validTripId(window.localStorage.getItem(TRIP_ID_STORAGE_KEY));
}

export function resolveTripId(urlValue) {
  return readTripIdFromUrl(urlValue) || readTripIdFromStorage();
}

export function persistTripId(tripId) {
  if (typeof window === "undefined") return;
  const normalized = validTripId(tripId);
  if (!normalized) return;

  window.localStorage.setItem(TRIP_ID_STORAGE_KEY, normalized);
  const url = new URL(window.location.href);
  url.searchParams.set(TRIP_ID_QUERY_KEY, normalized);
  window.history.replaceState(window.history.state, "", url);
}

export function clearTripId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TRIP_ID_STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete(TRIP_ID_QUERY_KEY);
  window.history.replaceState(window.history.state, "", url);
}

export function buildShareUrl(tripId, baseUrl) {
  const fallback =
    typeof window !== "undefined" ? window.location.href : "http://localhost";
  const url = new URL(baseUrl || fallback, "http://localhost");
  url.searchParams.set(TRIP_ID_QUERY_KEY, tripId);
  return url.toString();
}
