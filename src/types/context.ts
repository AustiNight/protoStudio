import type { ContextBudget } from './build';
import type { ChatMessage } from './chat';
import type { WorkItem } from './backlog';
import type { SiteManifest } from './vfs';

export type ContextMode = 'normal' | 'minimal';

export type SectionDetail = 'full' | 'signature';

export interface SectionContext {
  /**
   * Section name referenced by PP anchors.
   */
  name: string;
  /**
   * File path where the section is defined.
   */
  path: string;
  /**
   * Section markup or signature text.
   */
  content: string;
  /**
   * Whether this section is read-only context.
   */
  readonly: boolean;
  /**
   * Level of detail included for the section.
   */
  detail: SectionDetail;
  /**
   * Estimated token cost for the section content.
   */
  tokens: number;
}

export interface BuildContext {
  /**
   * Context detail mode.
   */
  mode: ContextMode;
  /**
   * Token allocation for the assembled context.
   */
  budget: ContextBudget;
  /**
   * System prompt for the Builder role.
   */
  systemPrompt: string;
  /**
   * Site manifest object.
   */
  siteManifest: SiteManifest;
  /**
   * Serialized site manifest used for prompting.
   */
  siteManifestJson: string;
  /**
   * Work item being built.
   */
  workItem: WorkItem;
  /**
   * Serialized work item used for prompting.
   */
  workItemJson: string;
  /**
   * Patch format instructions.
   */
  patchFormat: string;
  /**
   * CSS variables block used for theming consistency.
   */
  cssVariables: string;
  /**
   * Sections targeted by the current atom.
   */
  affectedSections: SectionContext[];
  /**
   * Read-only adjacent sections for continuity.
   */
  adjacentSections: SectionContext[];
  /**
   * Conversation history included in context.
   */
  conversation: ChatMessage[];
}

export interface ChatContext {
  /**
   * Context detail mode.
   */
  mode: ContextMode;
  /**
   * Token allocation for the assembled context.
   */
  budget: ContextBudget;
  /**
   * System prompt for the Chat role.
   */
  systemPrompt: string;
  /**
   * Summary of backlog items for the PO.
   */
  backlogSummary: string;
  /**
   * Conversation history included in context.
   */
  conversation: ChatMessage[];
}

export interface ContextUtilization {
  /**
   * Tokens used by the last assembled context.
   */
  used: number;
  /**
   * Tokens available for prompt context.
   */
  available: number;
  /**
   * Percent of available tokens used.
   */
  percent: number;
}
