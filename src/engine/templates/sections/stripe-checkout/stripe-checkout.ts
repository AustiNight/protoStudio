// === PP:FUNC:stripe-checkout-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="stripe-checkout"]');
  if (!section) {
    return;
  }

  const link = section.querySelector<HTMLAnchorElement>('[data-stripe-link]');
  if (!link) {
    return;
  }

  const href = link.getAttribute('href');
  if (!href || href.trim() === '#' || href.trim() === '') {
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
  }
})();
// === /PP:FUNC:stripe-checkout-init ===
