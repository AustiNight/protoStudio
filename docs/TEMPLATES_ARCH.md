# Templates Architecture

## Feature Decomposition

### Step 1: Identify Every Discrete Feature Across All Templates

I'm going to break every template into its atomic **sections** and **capabilities** — not pages, because pages are just containers for sections.

#### Sections (visual blocks that appear on a page)

| # | Section | Marketing | Blog | SaaS Landing | Portfolio | Small Business | Simple Store | Bookings | Form-to-Email |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Hero (title + slogan + CTA) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Navigation (top + hamburger) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | Footer (social + copyright) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | About section | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 5 | Contact (map + form-to-email) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Features grid | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — |
| 7 | Testimonials / reviews | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 8 | CTA banner (mid-page or bottom) | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| 9 | FAQ accordion | — | — | ✅ | — | ✅ | ✅ | ✅ | — |
| 10 | Pricing table (static) | — | — | ✅ | — | — | ✅ | ✅ | — |
| 11 | Feature comparison table | — | — | ✅ | — | — | — | — | — |
| 12 | Blog post listing | — | ✅ | — | — | — | — | — | — |
| 13 | Blog post detail | — | ✅ | — | — | — | — | — | — |
| 14 | Category/tag filter | — | ✅ | — | ✅ | — | ✅ | — | — |
| 15 | RSS feed | — | ✅ | — | — | — | — | — | — |
| 16 | Project gallery (grid) | — | — | — | ✅ | — | — | — | — |
| 17 | Lightbox overlay | — | — | — | ✅ | — | ✅ | — | — |
| 18 | Filterable grid | — | — | — | ✅ | — | ✅ | — | — |
| 19 | Services list (cards) | — | — | — | — | ✅ | — | ✅ | — |
| 20 | Team section | — | — | — | — | ✅ | — | ✅ | — |
| 21 | Hours / location | — | — | — | — | ✅ | ✅ | ✅ | — |
| 22 | Reviews embed (Google/Yelp) | — | — | — | — | ✅ | ✅ | — | — |
| 23 | Product cards | — | — | — | — | — | ✅ | — | — |
| 24 | Cart (localStorage) | — | — | — | — | — | ✅ | — | — |
| 25 | Stripe checkout link | — | — | — | — | — | ✅ | — | — |
| 26 | Calendar embed (Cal.com) | — | — | — | — | — | — | ✅ | — |
| 27 | Service menu (what you book) | — | — | — | — | — | — | ✅ | — |
| 28 | Multi-step form builder | — | — | — | — | — | — | — | ✅ |
| 29 | Form confirmation page | — | — | — | — | — | — | — | ✅ |
| 30 | SEO meta / OG / structured data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### Step 2: Overlap Analysis

Let me group these by how many templates use them:

#### Universal (8/8 templates)

| Section | Notes |
|---|---|
| Hero | Same structure everywhere; content/CTA text varies |
| Navigation | Same component; link count varies |
| Footer | Same component; column count varies |
| Contact (map + form) | Identical everywhere |
| SEO base | Identical everywhere |

#### Near-Universal (5–7/8 templates)

| Section | Count | Who Doesn't Need It |
|---|---|---|
| About | 7/8 | Form-to-Email |
| Features grid | 5/8 | Blog, Portfolio, Form-to-Email |
| Testimonials | 6/8 | Blog, Form-to-Email |
| CTA banner | 6/8 | Blog, Portfolio |

#### Shared Subset (2–4/8 templates)

| Section | Count | Who Uses It |
|---|---|---|
| FAQ accordion | 4/8 | SaaS, SmallBiz, Store, Bookings |
| Pricing table | 3/8 | SaaS, Store, Bookings |
| Category/tag filter | 3/8 | Blog, Portfolio, Store |
| Filterable grid | 3/8 | Portfolio, Store (+ Blog if tags) |
| Lightbox | 2/8 | Portfolio, Store |
| Services list | 2/8 | SmallBiz, Bookings |
| Team section | 2/8 | SmallBiz, Bookings |
| Hours/location | 3/8 | SmallBiz, Store, Bookings |
| Reviews embed | 2/8 | SmallBiz, Store |

#### Truly Unique (1/8 templates)

| Section | Template | Complexity |
|---|---|---|
| Blog post listing | Blog | Medium — needs data model for posts |
| Blog post detail | Blog | Medium — templated page generation |
| RSS feed | Blog | Low — XML generation |
| Feature comparison table | SaaS | Low — styled table |
| Project gallery | Portfolio | Medium — grid layout + image handling |
| Product cards | Store | Medium — needs data model for products |
| Cart (localStorage) | Store | High — state management, add/remove/quantity |
| Stripe checkout link | Store | Low — external link, but integration logic |
| Calendar embed | Bookings | Low — third-party embed |
| Service menu | Bookings | Low — styled list with booking CTAs |
| Multi-step form builder | Form-to-Email | High — dynamic form with state/validation |
| Form confirmation page | Form-to-Email | Low — static page |

---

### Step 3: Visualize the Overlap

```
                    UNIVERSAL CORE (5 sections)
                    ┌──────────────────────┐
                    │  Hero                │
                    │  Navigation          │
                    │  Footer              │
                    │  Contact (map+form)  │
                    │  SEO base            │
                    └──────────┬───────────┘
                               │
              NEAR-UNIVERSAL RING (4 sections)
              ┌────────────────┼────────────────┐
              │  About                          │
              │  Features grid                  │
              │  Testimonials                   │
              │  CTA banner                     │
              └────────────────┬────────────────┘
                               │
              SHARED MODULES (9 sections)
              ┌────────────────┼────────────────┐
              │  FAQ accordion                  │
              │  Pricing table                  │
              │  Category/tag filter            │
              │  Filterable grid                │
              │  Lightbox                       │
              │  Services list                  │
              │  Team section                   │
              │  Hours/location                 │
              │  Reviews embed                  │
              └────────────────┬────────────────┘
                               │
              UNIQUE FEATURES (12 sections)
   ┌───────┬────────┬──────────┼──────────┬──────────┬─────────┐
   │ Blog  │ SaaS   │Portfolio │SmallBiz  │  Store   │Bookings │Form
   │ post  │ compare│gallery   │(none     │ product  │calendar │multi-
   │ list  │ table  │          │ unique!) │ cards    │embed    │step
   │ post  │        │          │          │ cart     │service  │form
   │ detail│        │          │          │ stripe   │menu     │confirm
   │ RSS   │        │          │          │          │         │page
   └───────┘────────┘──────────┘──────────┘──────────┘─────────┘─────┘
```

**The critical insight: Small Business has ZERO unique sections.** It's assembled entirely from Universal + Near-Universal + Shared modules. This tells us something important about the architecture.

---

## The Architecture Decision

### Option A: Monolith — One Scaffold, Many Configurable Sections

```
📁 template-core/
├── scaffold.html              ← Universal page skeleton
├── css/
│   ├── variables.css          ← Theme tokens
│   ├── reset.css
│   ├── layout.css
│   └── sections/
│       ├── hero.css
│       ├── nav.css
│       ├── footer.css
│       ├── about.css
│       ├── features-grid.css
│       ├── testimonials.css
│       ├── cta-banner.css
│       ├── faq.css
│       ├── pricing-table.css
│       ├── gallery.css
│       ├── lightbox.css
│       ├── filterable-grid.css
│       ├── services-list.css
│       ├── team.css
│       ├── hours-location.css
│       ├── blog-listing.css
│       ├── blog-detail.css
│       ├── product-cards.css
│       ├── cart.css
│       ├── calendar-embed.css
│       ├── multi-step-form.css
│       └── ...
├── js/
│   ├── main.js
│   └── modules/
│       ├── nav.js
│       ├── lightbox.js
│       ├── filterable-grid.js
│       ├── cart.js
│       ├── multi-step-form.js
│       └── ...
├── sections/                   ← HTML partials
│   ├── hero.html
│   ├── nav.html
│   ├── about.html
│   ├── ...
│   └── (one per section)
└── configs/
    ├── marketing.json          ← Which sections to include + order
    ├── blog.json
    ├── saas-landing.json
    ├── portfolio.json
    ├── small-business.json
    ├── simple-store.json
    ├── bookings.json
    └── form-to-email.json
```

A config file looks like:

```json
{
  "id": "small_business",
  "label": "Small Business",
  "description": "Services, hours, reviews, team — for local businesses",
  "pages": {
    "index.html": {
      "sections": [
        "nav",
        "hero",
        "services-list",
        "features-grid",
        "about",
        "testimonials",
        "team",
        "hours-location",
        "reviews-embed",
        "cta-banner",
        "footer"
      ]
    },
    "about.html": {
      "sections": ["nav", "about-full", "team", "footer"]
    },
    "contact.html": {
      "sections": ["nav", "contact-map-form", "hours-location", "footer"]
    }
  },
  "features": {
    "formToEmail": true,
    "mapEmbed": true,
    "lightbox": false,
    "cart": false,
    "calendarEmbed": false,
    "blogEngine": false,
    "multiStepForm": false
  },
  "defaultTheme": {
    "primary": "#2563EB",
    "secondary": "#1E40AF",
    "accent": "#F59E0B",
    "bg": "#FFFFFF",
    "text": "#1F2937",
    "headingFont": "Inter",
    "bodyFont": "Inter"
  }
}
```

### Option B: Mini-Repos — 8 Separate Scaffolds

```
📁 templates/
├── marketing/
│   ├── scaffold.html
│   ├── css/style.css
│   ├── js/main.js
│   └── config.json
├── blog/
│   ├── scaffold.html
│   ├── css/style.css
│   ├── js/main.js
│   └── config.json
├── saas-landing/
│   └── ...
├── portfolio/
│   └── ...
├── small-business/
│   └── ...
├── simple-store/
│   └── ...
├── bookings/
│   └── ...
└── form-to-email/
    └── ...
```

---

### Evaluation Against Our Constraints

| Criterion | Monolith | Mini-Repos | Winner |
|---|---|---|---|
| **Builder compatibility** | One scaffold format, one anchor convention, one CSS variable system. Builder learns one pattern. | 8 different scaffolds the Builder must understand. 8x the prompt surface. | **Monolith** |
| **Patch engine simplicity** | One `PP:SECTION` convention everywhere. Patch engine has one code path. | Could diverge in structure; patch engine needs per-template awareness. | **Monolith** |
| **Section reuse** | Testimonials written once, used in 6 templates. Fix a bug once, fixed everywhere. | Testimonials duplicated in 6 repos. Bug fix = 6 edits. | **Monolith** |
| **Consistency across templates** | All templates share the same CSS reset, variable system, responsive breakpoints, spacing rhythm. | Drift risk — each mini-repo could develop its own spacing/sizing quirks. | **Monolith** |
| **Adding a new template** | Write a JSON config. Select from existing sections. Maybe add 1–2 new sections. Done in an hour. | Clone a repo, extract shared pieces, customize. Half a day minimum. | **Monolith** |
| **Adding a new section** | Write the section once (HTML + CSS + optional JS). Add to relevant configs. All templates that want it get it. | Write the section, then copy it into every template that needs it. | **Monolith** |
| **Bundle size** | All sections bundled, but unused ones are just JSON/HTML strings not included in the generated site. The config determines what's assembled. | Only the relevant template is loaded. Slightly smaller initial payload. | **Mini-Repos** (marginal) |
| **Cognitive complexity for maintainer** | One codebase with 30 sections and 8 configs. Clear structure. | 8 codebases with overlapping code. Harder to keep in sync. | **Monolith** |
| **Template-path first-build speed** | Assemble from pre-built sections by config. Very fast — string concatenation. | Load the mini-repo scaffold. Comparable speed. | **Tie** |
| **Scratch-path relevance** | Scratch path can still reuse individual sections from the monolith as building blocks. PO says "add a testimonials section" → Builder grabs the section partial. | Scratch path has no template to start from. Builder starts blank. Shared sections not easily accessible. | **Monolith** |
| **Risk of monolith bloat** | Could grow unwieldy if sections multiply unchecked. | Naturally bounded per repo. | **Mini-Repos** (marginal) |

**The answer is clearly Monolith** — and it's not close. Here's why it's not even a real tradeoff:

> The "bundle size" advantage of mini-repos is irrelevant because the template library is **never shipped to the end user's generated site**. It lives in the studio's client-side code. The generated site only contains the sections actually selected by the config. Unused sections don't exist in the VFS.

---

## Recommended Architecture: Composable Section Library with Config-Driven Assembly

### The Mental Model

```
┌──────────────────────────────────────────────────────────────┐
│                     SECTION LIBRARY                            │
│                                                                │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ │
│  │Hero │ │ Nav │ │About│ │Feat.│ │Testi│ │ CTA │ │Footer│ │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └──────┘ │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ │
│  │ FAQ │ │Price│ │Gall.│ │Light│ │Filtr│ │Servs│ │ Team │ │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └──────┘ │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ │
│  │Hours│ │Revws│ │Blog │ │Blog │ │ RSS │ │Prods│ │ Cart │ │
│  │ Loc │ │Embed│ │List │ │Detl │ │     │ │Cards│ │      │ │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └──────┘ │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐                  │
│  │Strpe│ │Cal. │ │Svc  │ │Multi │ │Confm │                  │
│  │Link │ │Embed│ │Menu │ │Form  │ │ Page │                  │
│  └─────┘ └─────┘ └─────┘ └──────┘ └──────┘                  │
│                                                                │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                    CONFIG selects
                           │
          ┌────────────────┼────────────────────┐
          ▼                ▼                    ▼
   ┌─────────────┐  ┌──────────────┐   ┌──────────────┐
   │ small_biz   │  │ portfolio    │   │ blog         │
   │ .json       │  │ .json        │   │ .json        │
   │             │  │              │   │              │
   │ hero ✓      │  │ hero ✓       │   │ hero ✓       │
   │ nav ✓       │  │ nav ✓        │   │ nav ✓        │
   │ services ✓  │  │ gallery ✓    │   │ blog-list ✓  │
   │ features ✓  │  │ lightbox ✓   │   │ blog-detail ✓│
   │ about ✓     │  │ filter ✓     │   │ categories ✓ │
   │ testmnls ✓  │  │ about ✓      │   │ RSS ✓        │
   │ team ✓      │  │ testmnls ✓   │   │ about ✓      │
   │ hours ✓     │  │ contact ✓    │   │ contact ✓    │
   │ reviews ✓   │  │ footer ✓     │   │ footer ✓     │
   │ cta ✓       │  │              │   │              │
   │ contact ✓   │  │              │   │              │
   │ footer ✓    │  │              │   │              │
   └──────┬──────┘  └──────┬───────┘   └──────┬───────┘
          │                │                   │
          ▼                ▼                   ▼
   Assembled VFS     Assembled VFS       Assembled VFS
   (only selected    (only selected      (only selected
    sections exist)   sections exist)     sections exist)
```

### Section Definition Schema

Each section in the library is a self-contained unit:

```typescript
interface SectionDefinition {
  // Identity
  id: string;                      // e.g., "testimonials"
  label: string;                   // e.g., "Testimonials"
  description: string;             // e.g., "Customer reviews in a card grid"
  category: 'universal' | 'near-universal' | 'shared' | 'unique';

  // Content
  html: string;                    // HTML partial with PP:SECTION anchors
  cssBlock: string;                // CSS with PP:BLOCK anchors
  jsModule?: string;               // Optional JS with PP:FUNC anchors
  jsDependencies?: string[];       // Other JS modules this needs (e.g., lightbox needs filterable-grid)

  // Customization points (used during quick-customize)
  slots: SectionSlot[];

  // Constraints
  requires?: string[];             // Other sections that must exist (e.g., "cart" requires "product-cards")
  conflictsWith?: string[];        // Sections that can't coexist (e.g., "multi-step-form" conflicts with "contact-simple")
  maxPerPage: number;              // Usually 1, but some (like CTA) could appear twice
  position?: {
    after?: string[];              // Preferred placement: after these sections
    before?: string[];             // Preferred placement: before these sections
    zone: 'header' | 'main' | 'footer';
  };
}

interface SectionSlot {
  name: string;                    // e.g., "heading", "subheading", "items"
  type: 'text' | 'rich-text' | 'image-list' | 'color' | 'link';
  default: string;                 // Placeholder value
  aiHint: string;                  // Instruction for AI customization
}
```

### Example: Testimonials Section Definition

```typescript
const testimonials: SectionDefinition = {
  id: 'testimonials',
  label: 'Testimonials',
  description: 'Customer reviews displayed as cards in a responsive grid',
  category: 'near-universal',

  html: `
<!-- PP:SECTION:testimonials -->
<section class="testimonials" data-pp-section="testimonials">
  <div class="container">
    <h2 class="section-heading">{{heading}}</h2>
    <p class="section-subheading">{{subheading}}</p>
    <div class="testimonials__grid">
      {{#each items}}
      <div class="testimonials__card">
        <blockquote class="testimonials__quote">
          <p>"{{this.quote}}"</p>
        </blockquote>
        <div class="testimonials__author">
          <strong>{{this.name}}</strong>
          <span>{{this.role}}</span>
        </div>
        <div class="testimonials__rating" aria-label="{{this.rating}} out of 5 stars">
          {{{this.starsHtml}}}
        </div>
      </div>
      {{/each}}
    </div>
  </div>
</section>
<!-- /PP:SECTION:testimonials -->`,

  cssBlock: `
/* === PP:BLOCK:testimonials-styles === */
.testimonials {
  padding: var(--spacing-section) 0;
  background: var(--color-bg-alt, var(--color-bg));
}
.testimonials__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}
.testimonials__card {
  background: var(--color-bg);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.testimonials__quote p {
  font-style: italic;
  color: var(--color-text);
  line-height: 1.6;
}
.testimonials__author {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
}
.testimonials__author strong {
  color: var(--color-text);
}
.testimonials__author span {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
.testimonials__rating {
  margin-top: 0.5rem;
  color: var(--color-accent, #F59E0B);
}
/* === /PP:BLOCK:testimonials-styles === */`,

  slots: [
    {
      name: 'heading',
      type: 'text',
      default: 'What Our Clients Say',
      aiHint: 'Generate a heading appropriate to the business type',
    },
    {
      name: 'subheading',
      type: 'text',
      default: 'Real feedback from real customers',
      aiHint: 'Generate a brief subheading that builds trust',
    },
    {
      name: 'items',
      type: 'rich-text',
      default: '[3 placeholder testimonials]',
      aiHint: 'Generate 3 realistic testimonials relevant to the business. Include name, role/location, quote, and rating (4-5 stars).',
    },
  ],

  requires: [],
  conflictsWith: [],
  maxPerPage: 1,
  position: {
    after: ['features-grid', 'services-list', 'about'],
    before: ['cta-banner', 'footer'],
    zone: 'main',
  },
};
```

### Template Assembly Engine

```typescript
class TemplateAssembler {
  private sectionLibrary: Map<string, SectionDefinition>;

  assemble(config: TemplateConfig, customization: QuickCustomization): VirtualFileSystem {
    const vfs = new VirtualFileSystem();

    // 1. Start with universal scaffold
    let html = this.getScaffoldShell();
    let css = this.getBaseCSS();
    let js = this.getBaseJS();

    // 2. Apply theme customization to CSS variables
    css = this.applyTheme(css, customization.theme ?? config.defaultTheme);

    // 3. Assemble each page
    for (const [pagePath, pageConfig] of Object.entries(config.pages)) {
      let pageHtml = html;
      let pageCss = css;
      let pageJs = js;

      // Insert sections in order
      for (const sectionId of pageConfig.sections) {
        const section = this.sectionLibrary.get(sectionId);
        if (!section) throw new Error(`Unknown section: ${sectionId}`);

        // Validate constraints
        this.validateConstraints(section, pageConfig.sections);

        // Fill slots with quick-customize values or defaults
        const filledHtml = this.fillSlots(section.html, customization, section.slots);

        // Append to page
        pageHtml = this.insertSection(pageHtml, filledHtml, section);
        pageCss = this.appendCssBlock(pageCss, section.cssBlock);
        if (section.jsModule) {
          pageJs = this.appendJsModule(pageJs, section.jsModule);
        }
      }

      vfs.addFile(pagePath, pageHtml);
    }

    vfs.addFile('css/style.css', pageCss);
    vfs.addFile('js/main.js', pageJs);
    vfs.version = 1;

    return vfs;
  }
}
```

---

## How This Integrates with the Iterative Build Engine

This is where the monolith decision pays compound dividends for the patch-based Builder:

### During Template Path (first build)

```
User: "I'm a plumber in Austin called Joe's Plumbing"
                    │
                    ▼
         PO classifies → small_business template
                    │
                    ▼
         TemplateAssembler.assemble(small_business.json, {
           title: "Joe's Plumbing",
           slogan: "Reliable Plumbing in Austin Since 2015",
           colors: { primary: "#2563EB", ... }
         })
                    │
                    ▼
         VFS v1 created with 12 sections already scaffolded
         and anchored (PP:SECTION, PP:BLOCK, PP:FUNC)
                    │
                    ▼
         Preview renders in iframe (< 30 seconds)
```

### During Iterative Building (subsequent atoms)

The Builder already knows the scaffold convention because **every template produces the same anchor format.** The Builder's prompt doesn't need to say "you're working on a small_business template" — it just says "here's the manifest, here are the affected sections, here's the atom." The anchors are the same whether the site started from `marketing.json` or `portfolio.json` or scratch.

### During Scratch Path

Even scratch-path builds benefit from the section library:

```
User: "Build me a greeting card generator based on zodiac signs"
                    │
                    ▼
         PO classifies → scratch path (no template match)
                    │
                    ▼
         PO generates requirements via chat
         PO still uses universal sections where applicable:
           "We'll need a nav, a hero, and a footer — I'll use
            our standard components for those so we can focus
            the custom work on the zodiac card generator."
                    │
                    ▼
         Builder creates scaffold with:
           - nav (from section library)
           - hero (from section library, customized)
           - zodiac-generator (CUSTOM section — built from scratch)
           - footer (from section library)
                    │
                    ▼
         Same PP:SECTION anchors, same patch format,
         same continuity checks — everything works identically
```

The section library serves as a **vocabulary of building blocks** that both paths use. Template path uses many pre-arranged; scratch path cherry-picks the universal ones and fills the rest with custom work.

---

## Section Dependency Graph

Some sections have dependencies or conflicts. The assembler and the PO both need to respect these:

```
  product-cards ──requires──► filterable-grid (optional)
       │
       └──requires──► cart (if store features enabled)
                        │
                        └──requires──► stripe-checkout-link

  lightbox ──requires──► gallery OR product-cards
                         (needs something to open in the lightbox)

  blog-detail ──requires──► blog-listing
                             (must have a listing to link from)

  multi-step-form ──conflicts──► contact-simple
                                 (both handle form submission;
                                  pick one pattern)

  calendar-embed ──enhances──► service-menu
                               (booking makes more sense
                                alongside a service list)

  reviews-embed ──enhances──► testimonials
                              (external reviews complement
                               curated testimonials)
```

The PO encodes these in backlog ordering. The assembler validates them at build time. If a user drags "cart" above "product-cards" in the backlog, the PO denies because of the dependency.

---

## Final Recommendation

### One Monolith, Three Tiers, Config-Driven

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: Universal Core (5 sections)                         │
│  Always included. Never removed. Foundation of every site.  │
│  hero, nav, footer, contact, seo-base                       │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: Common Sections (13 sections)                       │
│  Used by 2+ templates. Shared, tested, maintained once.     │
│  about, features-grid, testimonials, cta-banner, faq,       │
│  pricing-table, filterable-grid, lightbox, category-filter, │
│  services-list, team, hours-location, reviews-embed         │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: Specialist Sections (12 sections)                   │
│  Used by exactly 1 template. Higher complexity.             │
│  blog-listing, blog-detail, rss, feature-comparison,        │
│  project-gallery, product-cards, cart, stripe-checkout,     │
│  calendar-embed, service-menu, multi-step-form, form-confirm│
└─────────────────────────────────────────────────────────────┘
           +
┌─────────────────────────────────────────────────────────────┐
│  8 CONFIG FILES (one per template vertical)                  │
│  Each config is a recipe: which sections, what order,       │
│  which features enabled, default theme.                     │
│  ~30-50 lines of JSON each.                                 │
└─────────────────────────────────────────────────────────────┘
```

| Metric | Value |
|---|---|
| **Total sections to build** | 30 |
| **Sections reused across 2+ templates** | 18 (60%) |
| **Config files** | 8 (one per template, ~40 lines each) |
| **Scaffold format** | 1 (universal PP:SECTION/PP:BLOCK/PP:FUNC anchors) |
| **CSS variable systems** | 1 (shared `:root` block) |
| **Patch engine code paths** | 1 |
| **Builder prompt variants** | 1 (same prompt works for all templates + scratch) |
| **To add a new template** | Write 1 JSON config file; possibly add 1–2 new specialist sections |
| **To add a new section** | Write 1 SectionDefinition; add to relevant configs |
| **To fix a bug in testimonials** | Fix once; 6 templates get the fix automatically |
