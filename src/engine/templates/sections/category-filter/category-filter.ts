// === PP:FUNC:category-filter-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="category-filter"]');
  if (!section) {
    return;
  }

  const controls = section.querySelector<HTMLElement>('[data-filter-controls]');
  if (!controls) {
    return;
  }

  const buttons = Array.from(
    controls.querySelectorAll<HTMLButtonElement>('[data-filter-value]'),
  );
  if (buttons.length === 0) {
    return;
  }

  const scope = section.dataset.filterScope ?? 'primary';

  const emitFilter = (value: string): void => {
    const event = new CustomEvent('pp:filter-change', {
      detail: { scope, value },
    });
    document.dispatchEvent(event);
  };

  const setActiveButton = (activeButton: HTMLButtonElement): void => {
    buttons.forEach((button) => {
      const isActive = button === activeButton;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.filterValue ?? 'all';
      setActiveButton(button);
      emitFilter(value);
    });
  });

  const initialButton = buttons.find((button) => button.classList.contains('is-active'));
  if (initialButton) {
    setActiveButton(initialButton);
    emitFilter(initialButton.dataset.filterValue ?? 'all');
  }
})();
// === /PP:FUNC:category-filter-init ===
