// === PP:FUNC:filterable-grid-init ===
(() => {
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>('[data-pp-section="filterable-grid"]'),
  );
  if (sections.length === 0) {
    return;
  }

  const normalize = (value: string): string => value.trim().toLowerCase();

  const applyFilter = (section: HTMLElement, value: string): void => {
    const target = normalize(value);
    const items = Array.from(section.querySelectorAll<HTMLElement>('[data-filter-item]'));

    items.forEach((item) => {
      const tags = (item.dataset.filterTags ?? '')
        .split(',')
        .map((tag) => normalize(tag));
      const matches = target === 'all' || tags.includes(target);
      item.hidden = !matches;
      item.setAttribute('aria-hidden', (!matches).toString());
    });
  };

  sections.forEach((section) => {
    applyFilter(section, 'all');
  });

  document.addEventListener('pp:filter-change', (event) => {
    const detail = (event as CustomEvent<{ scope: string; value: string }>).detail;
    if (!detail) {
      return;
    }

    sections.forEach((section) => {
      const scope = section.dataset.filterScope ?? 'primary';
      if (detail.scope !== scope) {
        return;
      }
      applyFilter(section, detail.value);
    });
  });
})();
// === /PP:FUNC:filterable-grid-init ===
