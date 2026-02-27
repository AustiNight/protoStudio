// === PP:FUNC:faq-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="faq"]');
  if (!section) {
    return;
  }

  const items = Array.from(section.querySelectorAll<HTMLDetailsElement>('[data-faq-item]'));
  if (items.length === 0) {
    return;
  }

  const setAnswerHeight = (item: HTMLDetailsElement, open: boolean): void => {
    const answer = item.querySelector<HTMLElement>('[data-faq-answer]');
    if (!answer) {
      return;
    }

    if (!open) {
      answer.style.maxHeight = '0px';
      return;
    }

    requestAnimationFrame(() => {
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    });
  };

  items.forEach((item) => {
    setAnswerHeight(item, item.open);

    item.addEventListener('toggle', () => {
      if (item.open) {
        items.forEach((other) => {
          if (other !== item && other.open) {
            other.open = false;
            setAnswerHeight(other, false);
          }
        });
      }
      setAnswerHeight(item, item.open);
    });
  });
})();
// === /PP:FUNC:faq-init ===
