// === PP:FUNC:multi-step-form-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="multi-step-form"]');
  if (!section) {
    return;
  }

  const form = section.querySelector<HTMLFormElement>('[data-multistep-form]');
  const steps = Array.from(section.querySelectorAll<HTMLElement>('[data-form-step]'));
  const indicators = Array.from(
    section.querySelectorAll<HTMLElement>('[data-step-indicator]'),
  );
  const status = section.querySelector<HTMLElement>('[data-form-status]');

  if (!form || steps.length === 0) {
    return;
  }

  let currentIndex = 0;

  const setStatus = (message: string): void => {
    if (status) {
      status.textContent = message;
    }
  };

  const updateIndicators = (): void => {
    indicators.forEach((indicator, index) => {
      indicator.classList.toggle('is-active', index === currentIndex);
    });
  };

  const showStep = (index: number): void => {
    currentIndex = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      step.classList.toggle('is-active', stepIndex === currentIndex);
    });
    updateIndicators();
    setStatus('');
  };

  const validateStep = (step: HTMLElement): boolean => {
    const fields = Array.from(
      step.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
    );

    let isValid = true;
    fields.forEach((field) => {
      if (!field.hasAttribute('required')) {
        field.removeAttribute('aria-invalid');
        return;
      }
      const value = field.value.trim();
      const valid = value.length > 0;
      field.setAttribute('aria-invalid', (!valid).toString());
      if (!valid) {
        isValid = false;
      }
    });

    if (!isValid) {
      setStatus('Please complete the required fields before continuing.');
    }

    return isValid;
  };

  section.querySelectorAll<HTMLButtonElement>('[data-step-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const step = steps[currentIndex];
      if (!step || !validateStep(step)) {
        return;
      }
      showStep(currentIndex + 1);
    });
  });

  section.querySelectorAll<HTMLButtonElement>('[data-step-prev]').forEach((button) => {
    button.addEventListener('click', () => showStep(currentIndex - 1));
  });

  form.addEventListener('submit', (event) => {
    const step = steps[currentIndex];
    if (!step || !validateStep(step)) {
      event.preventDefault();
      return;
    }

    if (!form.action) {
      return;
    }

    event.preventDefault();
    setStatus('Sending your request...');

    fetch(form.action, {
      method: form.method || 'POST',
      body: new FormData(form),
      headers: {
        Accept: 'application/json',
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network error');
        }
        setStatus('Thanks! We will be in touch shortly.');
        form.reset();
        showStep(0);
      })
      .catch(() => {
        setStatus('Unable to submit the form. Please try again.');
      });
  });

  showStep(0);
})();
// === /PP:FUNC:multi-step-form-init ===
