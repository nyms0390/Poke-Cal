import { ACTIVE_SET_STORAGE_KEY } from "../data/active-set.js";

// Calls `onChange` when the shared active set may have changed behind this page's back, so a
// page never shows (and later writes back) a stale set:
// - `pageshow` with `persisted`: the page came back from the back/forward cache, where it
//   missed every change made on the pages visited in between;
// - `storage` for the active-set key (another tab wrote it; `crossTab` only). A hidden tab
//   defers the refresh until it is shown, so a Speed slider dragged in one tab doesn't
//   recompute a background Builder on every step;
// - `visibilitychange` to visible (`crossTab` only), in case a frozen tab missed an event.
// `onChange` should re-read the store and do nothing when it already matches the page.
// Refreshes are coalesced over `delayMs`. Returns a function that removes the listeners.
export function watchActiveSet(onChange, {
  win = globalThis,
  doc = globalThis.document,
  crossTab = true,
  delayMs = 50,
} = {}) {
  let pending = false;
  let timer = null;

  const run = () => {
    timer = null;
    pending = false;
    onChange();
  };
  const schedule = () => {
    if (doc?.hidden) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  };
  const handleStorage = (event) => {
    if (event.key !== null && event.key !== ACTIVE_SET_STORAGE_KEY) return;
    schedule();
  };
  const handlePageShow = (event) => {
    if (event.persisted) schedule();
  };
  const handleVisibility = () => {
    if (!doc.hidden && (pending || crossTab)) schedule();
  };

  win?.addEventListener?.("pageshow", handlePageShow);
  if (crossTab) win?.addEventListener?.("storage", handleStorage);
  doc?.addEventListener?.("visibilitychange", handleVisibility);
  return () => {
    clearTimeout(timer);
    win?.removeEventListener?.("pageshow", handlePageShow);
    win?.removeEventListener?.("storage", handleStorage);
    doc?.removeEventListener?.("visibilitychange", handleVisibility);
  };
}
