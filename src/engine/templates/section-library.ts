import type {
  SectionCategory,
  SectionDefinition,
  SectionValidationResult,
} from '../../types/template';

import { validateSectionDefinition } from './section-schema';

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 'hero',
    name: 'Hero',
    description: 'Primary page introduction with headline, subheading, and CTA.',
    category: 'universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Bring your next idea to life',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'A short statement that reinforces the main message.',
      },
      {
        id: 'ctaText',
        label: 'CTA Text',
        type: 'text',
        required: false,
        defaultValue: 'Get started',
      },
      {
        id: 'ctaHref',
        label: 'CTA Link',
        type: 'link',
        required: false,
        defaultValue: '#contact',
      },
      {
        id: 'backgroundStyle',
        label: 'Background Style',
        type: 'text',
        required: false,
        defaultValue: 'gradient',
      },
    ],
    files: {
      html: 'hero/hero.html',
      css: 'hero/hero.css',
    },
    anchors: {
      sectionId: 'hero',
      cssBlockId: 'hero',
    },
  },
  {
    id: 'nav',
    name: 'Navigation',
    description: 'Primary navigation with logo and link list.',
    category: 'universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'logoText',
        label: 'Logo Text',
        type: 'text',
        required: true,
        defaultValue: 'Studio',
      },
      {
        id: 'links',
        label: 'Navigation Links',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: ['Home', 'About', 'Services', 'Contact'],
      },
    ],
    files: {
      html: 'nav/nav.html',
      css: 'nav/nav.css',
      js: 'nav/nav.ts',
    },
    anchors: {
      sectionId: 'nav',
      cssBlockId: 'nav',
      jsFuncIds: ['nav-init'],
    },
  },
  {
    id: 'footer',
    name: 'Footer',
    description: 'Footer with social links and column layout.',
    category: 'universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'copyright',
        label: 'Copyright',
        type: 'text',
        required: true,
        defaultValue: 'Copyright 2026 Your Studio. All rights reserved.',
      },
      {
        id: 'socialLinks',
        label: 'Social Links',
        type: 'list',
        required: false,
        maxItems: 5,
        defaultValue: ['Instagram', 'LinkedIn', 'YouTube'],
      },
      {
        id: 'columns',
        label: 'Footer Columns',
        type: 'list',
        required: false,
        maxItems: 3,
        defaultValue: ['Company', 'Resources', 'Contact'],
      },
    ],
    files: {
      html: 'footer/footer.html',
      css: 'footer/footer.css',
    },
    anchors: {
      sectionId: 'footer',
      cssBlockId: 'footer',
    },
  },
  {
    id: 'contact',
    name: 'Contact',
    description: 'Contact form paired with address and map.',
    category: 'universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'address',
        label: 'Address',
        type: 'text',
        required: false,
        defaultValue: '123 Main Street, City, State',
      },
      {
        id: 'lat',
        label: 'Latitude',
        type: 'text',
        required: false,
        defaultValue: '40.7128',
      },
      {
        id: 'lng',
        label: 'Longitude',
        type: 'text',
        required: false,
        defaultValue: '-74.0060',
      },
      {
        id: 'formAction',
        label: 'Form Action',
        type: 'link',
        required: false,
        defaultValue: 'https://formspree.io/f/your-form-id',
      },
      {
        id: 'fields',
        label: 'Form Fields',
        type: 'list',
        required: false,
        maxItems: 6,
        defaultValue: ['Name', 'Email', 'Message'],
      },
    ],
    files: {
      html: 'contact/contact.html',
      css: 'contact/contact.css',
      js: 'contact/contact.ts',
    },
    anchors: {
      sectionId: 'contact',
      cssBlockId: 'contact',
      jsFuncIds: ['contact-init'],
    },
  },
  {
    id: 'seo-base',
    name: 'SEO Base',
    description: 'Base head tags for SEO and social sharing.',
    category: 'universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        defaultValue: 'Site Title',
      },
      {
        id: 'description',
        label: 'Description',
        type: 'text',
        required: true,
        defaultValue: 'A short description for search engines and social cards.',
      },
      {
        id: 'ogImage',
        label: 'Open Graph Image',
        type: 'image',
        required: false,
        defaultValue: 'https://images.unsplash.com/placeholder',
      },
      {
        id: 'ogType',
        label: 'Open Graph Type',
        type: 'text',
        required: false,
        defaultValue: 'website',
      },
    ],
    files: {
      html: 'seo-base/seo-base.html',
      css: 'seo-base/seo-base.css',
    },
    anchors: {
      sectionId: 'seo-base',
      cssBlockId: 'seo-base',
    },
    seo: {
      injectBaseMeta: true,
    },
  },
  {
    id: 'about',
    name: 'About',
    description: 'Image and text layout for company or product storytelling.',
    category: 'near-universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'About the studio',
      },
      {
        id: 'body',
        label: 'Body',
        type: 'richtext',
        required: true,
        defaultValue:
          'Share a short story about your team, what you build, and why it matters.',
      },
      {
        id: 'imageAlt',
        label: 'Image Alt Text',
        type: 'text',
        required: false,
        defaultValue: 'Team collaborating around a table',
      },
      {
        id: 'layout',
        label: 'Layout',
        type: 'text',
        required: false,
        defaultValue: 'left-img',
      },
    ],
    files: {
      html: 'about/about.html',
      css: 'about/about.css',
    },
    anchors: {
      sectionId: 'about',
      cssBlockId: 'about',
    },
    position: {
      after: ['hero'],
      before: ['testimonials', 'cta-banner', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'features-grid',
    name: 'Features Grid',
    description: 'Responsive grid of feature cards with icons and descriptions.',
    category: 'near-universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Capabilities that scale',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Everything you need to go from idea to launch.',
      },
      {
        id: 'items',
        label: 'Feature Items',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          'Spark | Rapid setup | Launch in days with a clear plan.',
          'Shield | Trusted delivery | Build with reliability in mind.',
          'Chart | Measurable impact | Track outcomes and iterate fast.',
        ],
      },
    ],
    files: {
      html: 'features-grid/features-grid.html',
      css: 'features-grid/features-grid.css',
    },
    anchors: {
      sectionId: 'features-grid',
      cssBlockId: 'features-grid',
    },
    position: {
      after: ['hero'],
      before: ['about', 'testimonials', 'cta-banner', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'testimonials',
    name: 'Testimonials',
    description: 'Customer reviews displayed as cards in a responsive grid.',
    category: 'near-universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'What our clients say',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Real feedback from teams like yours.',
      },
      {
        id: 'items',
        label: 'Testimonials',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          '"They delivered ahead of schedule." - Alex Rivera, Founder (5/5)',
          '"We finally have a site that converts." - Priya Shah, Marketing Lead (5/5)',
          '"Clear process, outstanding results." - Morgan Lee, COO (4/5)',
        ],
      },
    ],
    files: {
      html: 'testimonials/testimonials.html',
      css: 'testimonials/testimonials.css',
    },
    anchors: {
      sectionId: 'testimonials',
      cssBlockId: 'testimonials',
    },
    position: {
      after: ['features-grid', 'about'],
      before: ['cta-banner', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'cta-banner',
    name: 'CTA Banner',
    description: 'Full-width call-to-action band with heading and button.',
    category: 'near-universal',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Ready to build something great?',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: "Let's turn your next idea into a site that performs.",
      },
      {
        id: 'ctaText',
        label: 'CTA Text',
        type: 'text',
        required: true,
        defaultValue: 'Start a project',
      },
      {
        id: 'ctaHref',
        label: 'CTA Link',
        type: 'link',
        required: false,
        defaultValue: '#contact',
      },
      {
        id: 'style',
        label: 'Style',
        type: 'text',
        required: false,
        defaultValue: 'primary',
      },
    ],
    files: {
      html: 'cta-banner/cta-banner.html',
      css: 'cta-banner/cta-banner.css',
    },
    anchors: {
      sectionId: 'cta-banner',
      cssBlockId: 'cta-banner',
    },
    position: {
      after: ['features-grid', 'about', 'testimonials'],
      before: ['footer'],
      zone: 'main',
    },
  },
  {
    id: 'faq',
    name: 'FAQ',
    description: 'Frequently asked questions displayed as an accordion.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Frequently asked questions',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Clear answers to help you decide.',
      },
      {
        id: 'items',
        label: 'FAQ Items',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          'Do you offer retainers? | Yes - we offer ongoing support plans after launch.',
          'What is your typical timeline? | Most projects launch in 4-6 weeks depending on scope.',
          'Can you work with our existing brand? | Absolutely. We can build within your current system.',
        ],
      },
    ],
    files: {
      html: 'faq/faq.html',
      css: 'faq/faq.css',
      js: 'faq/faq.ts',
    },
    anchors: {
      sectionId: 'faq',
      cssBlockId: 'faq',
      jsFuncIds: ['faq-init'],
    },
    position: {
      after: ['testimonials', 'features-grid', 'services-list'],
      before: ['contact', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'pricing-table',
    name: 'Pricing Table',
    description: 'Tiered pricing cards with plan comparison.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Pricing that scales',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Transparent plans with no hidden fees.',
      },
      {
        id: 'ctaText',
        label: 'CTA Text',
        type: 'text',
        required: true,
        defaultValue: 'Choose plan',
      },
      {
        id: 'ctaHref',
        label: 'CTA Link',
        type: 'link',
        required: false,
        defaultValue: '#contact',
      },
      {
        id: 'plans',
        label: 'Plans',
        type: 'list',
        required: true,
        maxItems: 3,
        defaultValue: [
          'Starter | $29/mo | For solo founders | 3 pages, Email support, Brand refresh | standard',
          'Growth | $79/mo | Best for teams | Strategy workshop, 8 pages, Priority support | featured',
          'Scale | $149/mo | For growing orgs | Full brand system, 15 pages, Analytics | standard',
        ],
      },
    ],
    files: {
      html: 'pricing-table/pricing-table.html',
      css: 'pricing-table/pricing-table.css',
    },
    anchors: {
      sectionId: 'pricing-table',
      cssBlockId: 'pricing-table',
    },
    position: {
      after: ['features-grid', 'services-list'],
      before: ['testimonials', 'cta-banner'],
      zone: 'main',
    },
  },
  {
    id: 'category-filter',
    name: 'Category Filter',
    description: 'Filter buttons that refine grids by category.',
    category: 'shared',
    dependencies: ['filterable-grid'],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Browse by category',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Filter work by focus area.',
      },
      {
        id: 'scope',
        label: 'Filter Scope',
        type: 'text',
        required: false,
        defaultValue: 'primary',
      },
      {
        id: 'categories',
        label: 'Categories',
        type: 'list',
        required: true,
        maxItems: 8,
        defaultValue: [
          'Branding | branding',
          'Web | web',
          'Launch | launch',
          'Strategy | strategy',
        ],
      },
    ],
    files: {
      html: 'category-filter/category-filter.html',
      css: 'category-filter/category-filter.css',
      js: 'category-filter/category-filter.ts',
    },
    anchors: {
      sectionId: 'category-filter',
      cssBlockId: 'category-filter',
      jsFuncIds: ['category-filter-init'],
    },
    position: {
      after: ['hero', 'about'],
      before: ['filterable-grid'],
      zone: 'main',
    },
  },
  {
    id: 'filterable-grid',
    name: 'Filterable Grid',
    description: 'Card grid that can be filtered by category tags.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Featured work',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'A selection of recent launches and redesigns.',
      },
      {
        id: 'linkText',
        label: 'Link Text',
        type: 'text',
        required: false,
        defaultValue: 'View project',
      },
      {
        id: 'scope',
        label: 'Filter Scope',
        type: 'text',
        required: false,
        defaultValue: 'primary',
      },
      {
        id: 'items',
        label: 'Grid Items',
        type: 'list',
        required: true,
        maxItems: 9,
        defaultValue: [
          'Branding | Aurora Wellness | Identity refresh and spa launch kit. | /work/aurora',
          'Web | Northwind Labs | Responsive marketing site for a B2B team. | /work/northwind',
          'Launch | Skylane Studio | Product launch system and landing page. | /work/skylane',
        ],
      },
    ],
    files: {
      html: 'filterable-grid/filterable-grid.html',
      css: 'filterable-grid/filterable-grid.css',
      js: 'filterable-grid/filterable-grid.ts',
    },
    anchors: {
      sectionId: 'filterable-grid',
      cssBlockId: 'filterable-grid',
      jsFuncIds: ['filterable-grid-init'],
    },
    position: {
      after: ['category-filter', 'hero'],
      before: ['testimonials', 'cta-banner'],
      zone: 'main',
    },
  },
  {
    id: 'lightbox',
    name: 'Lightbox',
    description: 'Image grid with an overlay lightbox viewer.',
    category: 'shared',
    dependencies: ['gallery', 'product-cards'],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Studio highlights',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Tap an image to view it larger.',
      },
      {
        id: 'items',
        label: 'Images',
        type: 'list',
        required: true,
        maxItems: 8,
        defaultValue: [
          'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80 | Studio desk with samples | Brand explorations',
          'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80 | Laptop with design system | Design system work',
          'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80 | Meeting room setup | Client workshop',
          'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80 | Planning notes on table | Project planning',
        ],
      },
    ],
    files: {
      html: 'lightbox/lightbox.html',
      css: 'lightbox/lightbox.css',
      js: 'lightbox/lightbox.ts',
    },
    anchors: {
      sectionId: 'lightbox',
      cssBlockId: 'lightbox',
      jsFuncIds: ['lightbox-init'],
    },
    position: {
      after: ['filterable-grid', 'gallery'],
      before: ['testimonials', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'services-list',
    name: 'Services List',
    description: 'Service cards highlighting offerings.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Services',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Flexible packages for every stage.',
      },
      {
        id: 'services',
        label: 'Services',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          'Brand strategy | Positioning, messaging, and brand foundations. | Starting at $1,200',
          'Web design | Responsive sites that convert. | Starting at $2,500',
          'Launch support | Go-to-market assets and rollout plan. | Starting at $900',
        ],
      },
    ],
    files: {
      html: 'services-list/services-list.html',
      css: 'services-list/services-list.css',
    },
    anchors: {
      sectionId: 'services-list',
      cssBlockId: 'services-list',
    },
    position: {
      after: ['hero', 'about'],
      before: ['testimonials', 'team', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'team',
    name: 'Team',
    description: 'Team member cards with photo and role.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Meet the team',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'A small crew with senior-led delivery.',
      },
      {
        id: 'members',
        label: 'Team Members',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          'Avery Chen | Creative Director | Leads brand systems and visual direction. | https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
          'Jordan Lee | Product Strategist | Aligns stakeholder goals and roadmaps. | https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=900&q=80',
          'Riley Park | Experience Designer | Crafts intuitive flows and layouts. | https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=900&q=80',
        ],
      },
    ],
    files: {
      html: 'team/team.html',
      css: 'team/team.css',
    },
    anchors: {
      sectionId: 'team',
      cssBlockId: 'team',
    },
    position: {
      after: ['services-list', 'about'],
      before: ['hours-location', 'reviews-embed', 'footer'],
      zone: 'main',
    },
  },
  {
    id: 'hours-location',
    name: 'Hours & Location',
    description: 'Business hours table with address and contact info.',
    category: 'shared',
    dependencies: [],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Hours & location',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Visit the studio or schedule a call.',
      },
      {
        id: 'address',
        label: 'Address',
        type: 'text',
        required: true,
        defaultValue: '123 Main Street, City, State',
      },
      {
        id: 'phone',
        label: 'Phone',
        type: 'text',
        required: false,
        defaultValue: '(555) 123-4567',
      },
      {
        id: 'email',
        label: 'Email',
        type: 'text',
        required: false,
        defaultValue: 'hello@studio.com',
      },
      {
        id: 'mapLink',
        label: 'Map Link',
        type: 'link',
        required: false,
        defaultValue: 'https://maps.google.com/?q=123+Main+Street',
      },
      {
        id: 'hours',
        label: 'Hours',
        type: 'list',
        required: true,
        maxItems: 7,
        defaultValue: ['Mon-Fri | 9:00am-6:00pm', 'Sat | 10:00am-2:00pm', 'Sun | Closed'],
      },
    ],
    files: {
      html: 'hours-location/hours-location.html',
      css: 'hours-location/hours-location.css',
    },
    anchors: {
      sectionId: 'hours-location',
      cssBlockId: 'hours-location',
    },
    position: {
      after: ['team', 'contact'],
      before: ['footer'],
      zone: 'main',
    },
  },
  {
    id: 'reviews-embed',
    name: 'Reviews Embed',
    description: 'External reviews embed with static fallback cards.',
    category: 'shared',
    dependencies: ['testimonials'],
    conflicts: [],
    slots: [
      {
        id: 'heading',
        label: 'Heading',
        type: 'text',
        required: true,
        defaultValue: 'Recent reviews',
      },
      {
        id: 'subheading',
        label: 'Subheading',
        type: 'text',
        required: false,
        defaultValue: 'Verified feedback from our community.',
      },
      {
        id: 'embedCode',
        label: 'Embed Code',
        type: 'embed',
        required: false,
        defaultValue:
          '<div class=\"reviews-embed__placeholder\">Paste your review widget embed code here.</div>',
      },
      {
        id: 'reviews',
        label: 'Reviews',
        type: 'list',
        required: true,
        maxItems: 6,
        defaultValue: [
          'Outstanding service and clear communication. | Jamie L. | Google | 5',
          'Their team delivered exactly what we needed. | Morgan P. | Yelp | 5',
          'The new site feels premium and fast. | Casey R. | Google | 4',
        ],
      },
    ],
    files: {
      html: 'reviews-embed/reviews-embed.html',
      css: 'reviews-embed/reviews-embed.css',
    },
    anchors: {
      sectionId: 'reviews-embed',
      cssBlockId: 'reviews-embed',
    },
    position: {
      after: ['testimonials', 'team'],
      before: ['cta-banner', 'footer'],
      zone: 'main',
    },
  },
];

export class SectionLibrary {
  private sections: Map<string, SectionDefinition>;

  constructor(definitions: SectionDefinition[] = SECTION_DEFINITIONS) {
    this.sections = new Map(
      definitions.map((definition) => [definition.id, cloneSection(definition)]),
    );
  }

  getSection(id: string): SectionDefinition | null {
    const section = this.sections.get(id);
    return section ? cloneSection(section) : null;
  }

  getSectionsByCategory(category: SectionCategory): SectionDefinition[] {
    return Array.from(this.sections.values())
      .filter((section) => section.category === category)
      .map((section) => cloneSection(section));
  }

  validateSection(definition: SectionDefinition): SectionValidationResult {
    return validateSectionDefinition(definition);
  }

  getAllSectionIds(): string[] {
    return Array.from(this.sections.keys()).sort((a, b) => a.localeCompare(b));
  }
}

export const sectionLibrary = new SectionLibrary();

function cloneSection(section: SectionDefinition): SectionDefinition {
  return {
    ...section,
    dependencies: [...section.dependencies],
    conflicts: [...section.conflicts],
    slots: section.slots.map((slot) => ({
      ...slot,
      defaultValue: Array.isArray(slot.defaultValue)
        ? [...slot.defaultValue]
        : slot.defaultValue,
    })),
    files: { ...section.files },
    anchors: {
      ...section.anchors,
      jsFuncIds: section.anchors.jsFuncIds
        ? [...section.anchors.jsFuncIds]
        : undefined,
    },
    seo: section.seo ? { ...section.seo } : undefined,
    position: section.position
      ? {
          zone: section.position.zone,
          after: section.position.after ? [...section.position.after] : undefined,
          before: section.position.before ? [...section.position.before] : undefined,
        }
      : undefined,
  };
}
