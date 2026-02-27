// === PP:FUNC:cart-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="cart"]');
  if (!section) {
    return;
  }

  const STORAGE_KEY = 'pp-cart';
  const itemsContainer = section.querySelector<HTMLElement>('[data-cart-items]');
  const countBadge = section.querySelector<HTMLElement>('[data-cart-count]');
  const totalEl = section.querySelector<HTMLElement>('[data-cart-total]');
  const emptyEl = section.querySelector<HTMLElement>('[data-cart-empty]');
  const drawer = section.querySelector<HTMLElement>('[data-cart-drawer]');
  const checkout = section.querySelector<HTMLAnchorElement>('[data-cart-checkout]');

  if (!itemsContainer || !drawer) {
    return;
  }

  const readCart = (): CartItem[] => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as CartItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeCart = (items: CartItem[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  };

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(2)}`;
  };

  const updateSummary = (items: CartItem[]): void => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (countBadge) {
      countBadge.textContent = String(count);
    }
    if (totalEl) {
      totalEl.textContent = formatCurrency(total);
    }
    if (emptyEl) {
      section.dataset.cartEmpty = count === 0 ? 'true' : 'false';
    }
    if (checkout) {
      const disabled = count === 0;
      checkout.setAttribute('aria-disabled', disabled.toString());
    }
  };

  const buildItemRow = (item: CartItem): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'cart__item';
    row.dataset.itemId = item.id;

    const image = document.createElement('img');
    image.className = 'cart__item-image';
    image.src = item.image ?? '';
    image.alt = item.name;
    row.appendChild(image);

    const details = document.createElement('div');
    details.className = 'cart__item-details';

    const name = document.createElement('div');
    name.className = 'cart__item-name';
    name.textContent = item.name;
    details.appendChild(name);

    const price = document.createElement('div');
    price.className = 'cart__item-price';
    price.textContent = formatCurrency(item.price);
    details.appendChild(price);

    const remove = document.createElement('button');
    remove.className = 'cart__remove';
    remove.type = 'button';
    remove.dataset.cartRemove = 'true';
    remove.dataset.itemId = item.id;
    remove.textContent = 'Remove';
    details.appendChild(remove);

    row.appendChild(details);

    const controls = document.createElement('div');
    controls.className = 'cart__item-controls';

    const minus = document.createElement('button');
    minus.className = 'cart__qty-button';
    minus.type = 'button';
    minus.dataset.cartQty = 'decrease';
    minus.dataset.itemId = item.id;
    minus.textContent = '-';
    controls.appendChild(minus);

    const qty = document.createElement('div');
    qty.className = 'cart__qty-value';
    qty.textContent = String(item.quantity);
    controls.appendChild(qty);

    const plus = document.createElement('button');
    plus.className = 'cart__qty-button';
    plus.type = 'button';
    plus.dataset.cartQty = 'increase';
    plus.dataset.itemId = item.id;
    plus.textContent = '+';
    controls.appendChild(plus);

    row.appendChild(controls);
    return row;
  };

  const render = (items: CartItem[]): void => {
    itemsContainer.innerHTML = '';
    items.forEach((item) => itemsContainer.appendChild(buildItemRow(item)));
    updateSummary(items);
  };

  const setDrawerOpen = (open: boolean): void => {
    section.dataset.cartOpen = open ? 'true' : 'false';
    drawer.setAttribute('aria-hidden', (!open).toString());
  };

  const addItem = (newItem: CartItem): void => {
    const items = readCart();
    const existing = items.find((item) => item.id === newItem.id);
    if (existing) {
      existing.quantity += newItem.quantity;
    } else {
      items.push(newItem);
    }
    writeCart(items);
    render(items);
  };

  const updateQuantity = (id: string, delta: number): void => {
    const items = readCart()
      .map((item) => ({ ...item }))
      .map((item) => {
        if (item.id !== id) {
          return item;
        }
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      });
    writeCart(items);
    render(items);
  };

  const removeItem = (id: string): void => {
    const items = readCart().filter((item) => item.id !== id);
    writeCart(items);
    render(items);
  };

  section.querySelectorAll<HTMLButtonElement>('[data-cart-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const isOpen = section.dataset.cartOpen === 'true';
      setDrawerOpen(!isOpen);
    });
  });

  section.querySelectorAll<HTMLButtonElement>('[data-cart-close]').forEach((button) => {
    button.addEventListener('click', () => setDrawerOpen(false));
  });

  document.querySelectorAll<HTMLElement>('[data-cart-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const dataset = button.dataset;
      const id = dataset.productId ?? crypto.randomUUID();
      const name = dataset.productName ?? 'Product';
      const price = Number(dataset.productPrice) || 0;
      const image = dataset.productImage ?? '';
      addItem({ id, name, price, image, quantity: 1 });
      setDrawerOpen(true);
    });
  });

  itemsContainer.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const removeTarget = target.closest<HTMLElement>('[data-cart-remove]');
    if (removeTarget?.dataset.itemId) {
      removeItem(removeTarget.dataset.itemId);
      return;
    }

    const qtyTarget = target.closest<HTMLElement>('[data-cart-qty]');
    if (qtyTarget?.dataset.itemId) {
      const delta = qtyTarget.dataset.cartQty === 'increase' ? 1 : -1;
      updateQuantity(qtyTarget.dataset.itemId, delta);
    }
  });

  render(readCart());
})();

interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
}
// === /PP:FUNC:cart-init ===
