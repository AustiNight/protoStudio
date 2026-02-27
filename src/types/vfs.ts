/**
 * Named color tokens used to populate CSS variables.
 */
export interface ColorPalette {
  /**
   * Primary brand color.
   */
  primary: string;
  /**
   * Secondary brand color.
   */
  secondary: string;
  /**
   * Accent color for emphasis.
   */
  accent: string;
  /**
   * Default background color.
   */
  bg: string;
  /**
   * Default text color.
   */
  text: string;
}

/**
 * Font selections for headings and body text.
 */
export interface FontSelection {
  /**
   * Font family for headings.
   */
  headingFont: string;
  /**
   * Font family for body copy.
   */
  bodyFont: string;
}

/**
 * Metadata stored alongside the VFS for template customization.
 */
export interface VfsMetadata {
  /**
   * Site title used for SEO and headings.
   */
  title: string;
  /**
   * Site description used for SEO metadata.
   */
  description: string;
  /**
   * Color palette applied to CSS variables.
   */
  colors: ColorPalette;
  /**
   * Font selections applied to CSS variables.
   */
  fonts: FontSelection;
}

/**
 * Single virtual file stored in memory.
 */
export interface VirtualFile {
  /**
   * File path within the virtual filesystem.
   */
  path: string;
  /**
   * File contents as UTF-8 text.
   */
  content: string;
  /**
   * Content hash used for diffing and integrity checks.
   */
  hash: string;
  /**
   * Unix timestamp (ms) when the file was last modified.
   */
  lastModified: number;
}

/**
 * In-memory virtual filesystem for the generated site.
 */
export interface VirtualFileSystem {
  /**
   * Map of file path to virtual file data.
   */
  files: Map<string, VirtualFile>;
  /**
   * Incrementing version number after each successful build.
   */
  version: number;
  /**
   * Optional template id when the session uses a template.
   */
  templateId?: string;
  /**
   * Metadata describing the site's theme and SEO.
   */
  metadata: VfsMetadata;
}

/**
 * Serialized VFS snapshot for persistence.
 */
export interface VfsSnapshot {
  /**
   * Ordered list of files captured in the snapshot.
   */
  files: VirtualFile[];
  /**
   * Version number captured at snapshot time.
   */
  version: number;
  /**
   * Optional template id for template-based sessions.
   */
  templateId?: string;
  /**
   * Metadata describing the site's theme and SEO.
   */
  metadata: VfsMetadata;
}

/**
 * Summary of a single HTML page in the VFS.
 */
export interface SiteManifestPage {
  /**
   * File path for the page.
   */
  path: string;
  /**
   * Ordered list of section names found in the page.
   */
  sections: string[];
}

/**
 * Lightweight summary of the current VFS for builder context.
 */
export interface SiteManifest {
  /**
   * List of HTML pages and their sections.
   */
  pages: SiteManifestPage[];
  /**
   * List of CSS block anchor names.
   */
  cssBlocks: string[];
  /**
   * List of JS function anchor names.
   */
  jsFunctions: string[];
  /**
   * Theme metadata for colors and fonts.
   */
  theme: {
    colors: ColorPalette;
    fonts: FontSelection;
  };
}
