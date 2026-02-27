// === PP:FUNC:lightbox-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="lightbox"]');
  if (!section) {
    return;
  }

  const items = Array.from(section.querySelectorAll<HTMLElement>('[data-lightbox-item]'));
  const overlay = section.querySelector<HTMLElement>('[data-lightbox-overlay]');
  const image = section.querySelector<HTMLImageElement>('[data-lightbox-image]');
  const caption = section.querySelector<HTMLElement>('[data-lightbox-caption]');
  const closeButton = section.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const prevButton = section.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const nextButton = section.querySelector<HTMLButtonElement>('[data-lightbox-next]');

  if (!overlay || !image || !caption || items.length === 0) {
    return;
  }

  let currentIndex = 0;

  const updateControls = (): void => {
    const hasMultiple = items.length > 1;
    if (prevButton) {
      prevButton.disabled = !hasMultiple;
    }
    if (nextButton) {
      nextButton.disabled = !hasMultiple;
    }
  };

  const setActiveItem = (index: number): void => {
    const item = items[index];
    if (!item) {
      return;
    }

    currentIndex = index;
    image.src = item.dataset.lightboxSrc ?? '';
    image.alt = item.dataset.lightboxAlt ?? '';
    caption.textContent = item.dataset.lightboxCaption ?? '';
    updateControls();
  };

  const open = (index: number): void => {
    setActiveItem(index);
    section.setAttribute('data-lightbox-open', 'true');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const close = (): void => {
    section.removeAttribute('data-lightbox-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  items.forEach((item, index) => {
    item.addEventListener('click', () => open(index));
  });

  closeButton?.addEventListener('click', close);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  prevButton?.addEventListener('click', () => {
    const nextIndex = (currentIndex - 1 + items.length) % items.length;
    setActiveItem(nextIndex);
  });

  nextButton?.addEventListener('click', () => {
    const nextIndex = (currentIndex + 1) % items.length;
    setActiveItem(nextIndex);
  });

  window.addEventListener('keydown', (event) => {
    if (!section.hasAttribute('data-lightbox-open')) {
      return;
    }

    if (event.key === 'Escape') {
      close();
    }

    if (event.key === 'ArrowLeft') {
      const nextIndex = (currentIndex - 1 + items.length) % items.length;
      setActiveItem(nextIndex);
    }

    if (event.key === 'ArrowRight') {
      const nextIndex = (currentIndex + 1) % items.length;
      setActiveItem(nextIndex);
    }
  });
})();
// === /PP:FUNC:lightbox-init ===
