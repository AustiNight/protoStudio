import type { VfsMetadata } from './vfs';

/**
 * Patch operation to replace a named section's inner HTML.
 */
export interface SectionReplace {
  /**
   * Operation discriminator.
   */
  op: 'section.replace';
  /**
   * Target HTML file path.
   */
  file: string;
  /**
   * Section id being replaced.
   */
  sectionId: string;
  /**
   * New inner HTML for the section (anchors preserved).
   */
  html: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to insert a new section before an insert marker.
 */
export interface SectionInsert {
  /**
   * Operation discriminator.
   */
  op: 'section.insert';
  /**
   * Target HTML file path.
   */
  file: string;
  /**
   * Insert marker id to place the section before.
   */
  before: string;
  /**
   * New section id to insert.
   */
  sectionId: string;
  /**
   * Full section HTML including anchors.
   */
  html: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to delete an existing section by id.
 */
export interface SectionDelete {
  /**
   * Operation discriminator.
   */
  op: 'section.delete';
  /**
   * Target HTML file path.
   */
  file: string;
  /**
   * Section id to delete.
   */
  sectionId: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to append a new CSS block.
 */
export interface CssAppend {
  /**
   * Operation discriminator.
   */
  op: 'css.append';
  /**
   * Target CSS file path.
   */
  file: string;
  /**
   * Block id for the appended CSS block.
   */
  blockId: string;
  /**
   * CSS block content including PP:BLOCK anchors.
   */
  css: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to replace an existing CSS block.
 */
export interface CssReplaceBlock {
  /**
   * Operation discriminator.
   */
  op: 'css.replace';
  /**
   * Target CSS file path.
   */
  file: string;
  /**
   * Block id of the CSS block being replaced.
   */
  blockId: string;
  /**
   * Replacement CSS block content including anchors.
   */
  css: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to append a new JavaScript function block.
 */
export interface JsAppend {
  /**
   * Operation discriminator.
   */
  op: 'js.append';
  /**
   * Target JS file path.
   */
  file: string;
  /**
   * Function id for the appended JS block.
   */
  funcId: string;
  /**
   * JS content including PP:FUNC anchors.
   */
  js: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to replace an existing JavaScript function block.
 */
export interface JsReplaceFunction {
  /**
   * Operation discriminator.
   */
  op: 'js.replace';
  /**
   * Target JS file path.
   */
  file: string;
  /**
   * Function id of the block being replaced.
   */
  funcId: string;
  /**
   * Replacement JS content including PP:FUNC anchors.
   */
  js: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to create a new file.
 */
export interface FileCreate {
  /**
   * Operation discriminator.
   */
  op: 'file.create';
  /**
   * File path to create.
   */
  file: string;
  /**
   * Full content for the new file.
   */
  content: string;
  /**
   * Whether creation should only occur if the file is absent.
   */
  ifAbsent: boolean;
}

/**
 * Patch operation to delete a file by path.
 */
export interface FileDelete {
  /**
   * Operation discriminator.
   */
  op: 'file.delete';
  /**
   * File path to delete.
   */
  file: string;
  /**
   * Expected file version for optimistic locking.
   */
  ifVersion: number;
}

/**
 * Patch operation to update VFS metadata values.
 */
export interface MetadataUpdate {
  /**
   * Operation discriminator.
   */
  op: 'meta.update';
  /**
   * File path associated with the metadata update.
   */
  file: string;
  /**
   * Metadata fields to update.
   */
  fields: Partial<VfsMetadata>;
}

/**
 * Union of all supported patch operations.
 */
export type PatchOperation =
  | SectionReplace
  | SectionInsert
  | SectionDelete
  | CssAppend
  | CssReplaceBlock
  | JsAppend
  | JsReplaceFunction
  | FileCreate
  | FileDelete
  | MetadataUpdate;

/**
 * Builder patch describing a single atomic change.
 */
export interface BuildPatch {
  /**
   * Work item id that produced this patch.
   */
  workItemId: string;
  /**
   * Expected VFS version for optimistic locking.
   */
  targetVersion: number;
  /**
   * Ordered list of patch operations to apply.
   */
  operations: PatchOperation[];
}

/**
 * Result of applying a patch to the VFS.
 */
export interface PatchResult {
  /**
   * Whether the patch succeeded.
   */
  success: boolean;
  /**
   * Updated VFS version when successful.
   */
  version?: number;
  /**
   * Error message when the patch fails.
   */
  error?: string;
  /**
   * Operation that failed, if known.
   */
  failedOp?: PatchOperation;
  /**
   * Validation or continuity violations, if any.
   */
  violations?: string[];
  /**
   * Retry count associated with this patch attempt.
   */
  retryCount?: number;
}
