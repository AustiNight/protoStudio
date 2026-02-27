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
