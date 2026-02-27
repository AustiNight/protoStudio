/**
 * Effort sizing for backlog items.
 */
export type Effort = 'S' | 'M' | 'L';

/**
 * Workflow status for a backlog item.
 */
export type WorkItemStatus =
  | 'backlog'
  | 'on_deck'
  | 'in_progress'
  | 'done'
  | 'blocked';

/**
 * Atom classification for build steps.
 */
export type AtomType =
  | 'structure'
  | 'content'
  | 'style'
  | 'behavior'
  | 'integration';

/**
 * Backlog work item produced by the PO and executed by the builder.
 */
export interface WorkItem {
  /**
   * Unique work item identifier.
   */
  id: string;
  /**
   * Associated session identifier.
   */
  sessionId: string;
  /**
   * Short title describing the change.
   */
  title: string;
  /**
   * Detailed description of the change.
   */
  description: string;
  /**
   * Estimated effort size.
   */
  effort: Effort;
  /**
   * Current workflow status.
   */
  status: WorkItemStatus;
  /**
   * Ordering index within the backlog.
   */
  order: number;
  /**
   * Work item dependency ids that must be completed first.
   */
  dependencies: string[];
  /**
   * Rationale for why this item is needed.
   */
  rationale: string;
  /**
   * Unix timestamp (ms) when the item was created.
   */
  createdAt: number;
  /**
   * Unix timestamp (ms) when the item was completed.
   */
  completedAt?: number;
  /**
   * VFS version number when the item was applied.
   */
  buildVersion?: number;
  /**
   * Atom type classification for builder constraints.
   */
  atomType: AtomType;
  /**
   * File paths expected to change for this atom.
   */
  filesTouch: string[];
  /**
   * Estimated lines changed for this atom.
   */
  estimatedLines: number;
  /**
   * Expected section count delta for this atom when structure changes occur.
   */
  expectedSectionDelta?: number;
  /**
   * Short description of the visible change the user should notice.
   */
  visibleChange: string;
}

/**
 * Decision returned when evaluating a backlog reorder request.
 */
export interface ReorderDecision {
  /**
   * Whether the reorder is approved.
   */
  approved: boolean;
  /**
   * Explanation for approval or denial.
   */
  reason: string;
  /**
   * Backlog ordering to apply (original if denied, reordered if approved).
   */
  backlog: WorkItem[];
}
