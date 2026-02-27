// === PP:FUNC:rss-generate ===
export interface RssPost {
  title: string;
  link: string;
  guid?: string;
  description: string;
  author?: string;
  date: string;
  categories?: string[];
}

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  language?: string;
  lastBuildDate?: string;
}

export function generateRssXml(channel: RssChannel, posts: RssPost[]): string {
  const lastBuildDate = channel.lastBuildDate ?? new Date().toUTCString();
  const items = posts
    .map((post) => {
      const categories = (post.categories ?? [])
        .map((category) => `<category>${escapeXml(category)}</category>`)
        .join('');
      const guid = post.guid ?? post.link;
      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(post.link)}</link>`,
        `<guid isPermaLink="true">${escapeXml(guid)}</guid>`,
        `<description>${escapeXml(post.description)}</description>`,
        post.author ? `<author>${escapeXml(post.author)}</author>` : '',
        `<pubDate>${escapeXml(new Date(post.date).toUTCString())}</pubDate>`,
        categories,
        '</item>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    channel.language ? `<language>${escapeXml(channel.language)}</language>` : '',
    `<lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    items,
    '</channel>',
    '</rss>',
  ]
    .filter(Boolean)
    .join('');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
// === /PP:FUNC:rss-generate ===
