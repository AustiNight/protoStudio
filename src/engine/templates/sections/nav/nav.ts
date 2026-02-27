// === PP:FUNC:nav-init ===
(() => {
  const nav = document.querySelector<HTMLElement>('[data-pp-section="nav"]');
  if (!nav) {
    return;
  }

  const toggle = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const menu = nav.querySelector<HTMLElement>('[data-nav-menu]');

  if (!toggle || !menu) {
    return;
  }

  const openClass = 'nav--open';

  const setExpanded = (expanded: boolean) => {
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    nav.classList.toggle(openClass, expanded);
  };

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });

  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) {
      setExpanded(false);
    }
  });
})();
// === /PP:FUNC:nav-init ===
