export function restoreBuilderCardFocus(panel, focusKey, { onOpenPanel } = {}) {
  if (!focusKey) return;
  const control = [...panel.querySelectorAll("[data-live-key]")]
    .find(({ dataset }) => dataset.liveKey === focusKey);
  if (!control) return;

  const coverageSection = control.closest("details.builder-coverage-section");
  if (coverageSection && !coverageSection.open) {
    onOpenPanel?.(coverageSection.dataset.analysisPanelKey);
    coverageSection.open = true;
  }
  control.scrollIntoView({ block: "center", inline: "nearest" });
  control.focus({ preventScroll: true });
}
