// === PP:FUNC:blog-listing-init ===
(() => {
  const section = document.querySelector<HTMLElement>('[data-pp-section="blog-listing"]');
  if (!section) {
    return;
  }

  const list = section.querySelector<HTMLElement>('[data-blog-list]');
  const prevButton = section.querySelector<HTMLButtonElement>('[data-blog-prev]');
  const nextButton = section.querySelector<HTMLButtonElement>('[data-blog-next]');
  const pageStatus = section.querySelector<HTMLElement>('[data-blog-page]');
  const dataScript = section.querySelector<HTMLScriptElement>('[data-blog-posts]');

  if (!list || !dataScript) {
    return;
  }

  let posts: BlogPost[] = [];
  try {
    posts = JSON.parse(dataScript.textContent ?? '[]') as BlogPost[];
  } catch {
    posts = [];
  }

  const perPage = Math.max(1, Number(section.dataset.postsPerPage) || 6);
  let currentPage = 1;

  const totalPages = (): number => Math.max(1, Math.ceil(posts.length / perPage));

  const buildMeta = (post: BlogPost): HTMLElement => {
    const meta = document.createElement('div');
    meta.className = 'blog-listing__meta';
    const metaParts = [post.category, post.author, post.date].filter(Boolean);
    metaParts.forEach((part) => {
      const span = document.createElement('span');
      span.textContent = part ?? '';
      meta.appendChild(span);
    });
    return meta;
  };

  const buildCard = (post: BlogPost): HTMLElement => {
    const card = document.createElement('article');
    card.className = 'blog-listing__card';

    if (post.image) {
      const media = document.createElement('div');
      media.className = 'blog-listing__media';
      const img = document.createElement('img');
      img.src = post.image;
      img.alt = post.title;
      img.loading = 'lazy';
      media.appendChild(img);
      card.appendChild(media);
    }

    const body = document.createElement('div');
    body.className = 'blog-listing__body';
    body.appendChild(buildMeta(post));

    const title = document.createElement('h3');
    title.className = 'blog-listing__card-title';
    title.textContent = post.title;
    body.appendChild(title);

    const excerpt = document.createElement('p');
    excerpt.className = 'blog-listing__excerpt';
    excerpt.textContent = post.excerpt;
    body.appendChild(excerpt);

    const link = document.createElement('a');
    link.className = 'blog-listing__link';
    link.href = post.href;
    link.textContent = post.ctaText ?? 'Read story';
    body.appendChild(link);

    card.appendChild(body);
    return card;
  };

  const render = (): void => {
    list.innerHTML = '';
    const start = (currentPage - 1) * perPage;
    const pagePosts = posts.slice(start, start + perPage);

    if (pagePosts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'blog-listing__excerpt';
      empty.textContent = 'No posts available yet.';
      list.appendChild(empty);
    } else {
      pagePosts.forEach((post) => list.appendChild(buildCard(post)));
    }

    if (pageStatus) {
      pageStatus.textContent = `Page ${currentPage} of ${totalPages()}`;
    }

    if (prevButton) {
      prevButton.disabled = currentPage <= 1;
    }
    if (nextButton) {
      nextButton.disabled = currentPage >= totalPages();
    }
  };

  prevButton?.addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    render();
  });

  nextButton?.addEventListener('click', () => {
    currentPage = Math.min(totalPages(), currentPage + 1);
    render();
  });

  render();
})();

interface BlogPost {
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  href: string;
  image?: string;
  ctaText?: string;
}
// === /PP:FUNC:blog-listing-init ===
