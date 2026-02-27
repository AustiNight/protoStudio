import type { ColorPalette, FontSelection } from './vfs';

/**
 * High-level category for a section in the library.
 */
export type SectionCategory = 'universal' | 'near-universal' | 'shared' | 'unique';

/**
 * Allowed slot content types for section customization.
 */
export type SlotType =
  | 'text'
  | 'richtext'
  | 'image'
  | 'icon'
  | 'link'
  | 'list'
  | 'embed';

/**
 * Preferred placement hints for sections within a page.
 */
export interface SectionPosition {
  /**
   * Section ids that this section should follow when possible.
   */
  after?: string[];
  /**
   * Section ids that this section should precede when possible.
   */
  before?: string[];
  /**
   * Page zone for placement.
   */
  zone: 'header' | 'main' | 'footer';
}

/**
 * Customization slot definition for a section.
 */
export interface SectionSlot {
  /**
   * Unique slot identifier.
   */
  id: string;
  /**
   * Human-friendly slot label.
   */
  label: string;
  /**
   * Slot content type.
   */
  type: SlotType;
  /**
   * Whether the slot is required for rendering.
   */
  required: boolean;
  /**
   * Maximum number of items for list-type slots.
   */
  maxItems?: number;
  /**
   * Default value used when no customization is provided.
   */
  defaultValue?: string | string[];
}

/**
 * Section definition for the monolithic section library.
 */
export interface SectionDefinition {
  /**
   * Unique section identifier.
   */
  id: string;
  /**
   * Human-friendly section name.
   */
  name: string;
  /**
   * Description of the section's purpose.
   */
  description: string;
  /**
   * Section category used for grouping.
   */
  category: SectionCategory;
  /**
   * Section ids required for this section to render correctly.
   */
  dependencies: string[];
  /**
   * Section ids that cannot coexist with this section.
   */
  conflicts: string[];
  /**
   * Customization slots for this section.
   */
  slots: SectionSlot[];
  /**
   * File paths for the section's assets.
   */
  files: {
    /**
     * HTML partial path for the section.
     */
    html: string;
    /**
     * CSS file path for the section.
     */
    css: string;
    /**
     * Optional JS module path for the section.
     */
    js?: string;
  };
  /**
   * Anchor identifiers required by the patch protocol.
   */
  anchors: {
    /**
     * Section anchor id used in HTML.
     */
    sectionId: string;
    /**
     * CSS block anchor id.
     */
    cssBlockId: string;
    /**
     * Optional JS function anchor ids.
     */
    jsFuncIds?: string[];
  };
  /**
   * Optional SEO instructions for this section.
   */
  seo?: {
    /**
     * Whether to inject base meta tags for the page.
     */
    injectBaseMeta: boolean;
  };
  /**
   * Optional placement hints for the assembler.
   */
  position?: SectionPosition;
}

/**
 * Validation issue reported for a section schema check.
 */
export interface SectionValidationIssue {
  /**
   * Path to the invalid field.
   */
  path: string;
  /**
   * Description of the validation error.
   */
  message: string;
}

/**
 * Result of validating a section definition.
 */
export interface SectionValidationResult {
  /**
   * Whether the section definition is valid.
   */
  valid: boolean;
  /**
   * List of validation issues discovered.
   */
  issues: SectionValidationIssue[];
}

/**
 * Per-page template configuration.
 */
export interface TemplatePageConfig {
  /**
   * Ordered list of section ids for this page.
   */
  sections: string[];
}

/**
 * Feature flags enabled for a template.
 */
export interface TemplateFeatureFlags {
  /**
   * Enables form-to-email behavior.
   */
  formToEmail: boolean;
  /**
   * Enables map embedding in contact sections.
   */
  mapEmbed: boolean;
  /**
   * Enables lightbox support for galleries.
   */
  lightbox: boolean;
  /**
   * Enables cart functionality for store templates.
   */
  cart: boolean;
  /**
   * Enables calendar embed functionality.
   */
  calendarEmbed: boolean;
  /**
   * Enables blog engine support.
   */
  blogEngine: boolean;
  /**
   * Enables multi-step forms.
   */
  multiStepForm: boolean;
}

/**
 * Theme values used for template defaults.
 */
export interface TemplateTheme extends ColorPalette, FontSelection {}

/**
 * Template configuration describing pages, sections, and defaults.
 */
export interface TemplateConfig {
  /**
   * Unique template identifier.
   */
  id: string;
  /**
   * Human-friendly template label.
   */
  label: string;
  /**
   * Short description of the template.
   */
  description: string;
  /**
   * Page configuration map keyed by page path.
   */
  pages: Record<string, TemplatePageConfig>;
  /**
   * Feature flags enabled for the template.
   */
  features: TemplateFeatureFlags;
  /**
   * Default theme applied when initializing the VFS.
   */
  defaultTheme: TemplateTheme;
}

/**
 * Quick customization inputs applied during template assembly.
 */
export interface QuickCustomization {
  /**
   * Suggested site title.
   */
  title?: string;
  /**
   * Suggested slogan or subtitle.
   */
  slogan?: string;
  /**
   * Suggested primary brand color override.
   */
  primaryColor?: string;
  /**
   * Optional industry hint from classification.
   */
  industry?: string;
  /**
   * Optional color palette overrides.
   */
  colors?: Partial<ColorPalette>;
  /**
   * Slot-specific overrides for section assembly.
   */
  slotOverrides?: Record<string, string | string[]>;
}

/**
 * Single template configuration validation issue.
 */
export interface ValidationIssue {
  /**
   * Path to the invalid field.
   */
  path: string;
  /**
   * Description of the validation error.
   */
  message: string;
}

/**
 * Result of validating a template configuration.
 */
export interface ValidationResult {
  /**
   * Whether the template config is valid.
   */
  valid: boolean;
  /**
   * List of validation issues discovered.
   */
  issues: ValidationIssue[];
}
