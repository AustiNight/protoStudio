/**
 * Single SEO validation issue.
 */
export interface SeoValidationIssue {
  /**
   * File or field path associated with the issue.
   */
  path: string;
  /**
   * Description of the validation failure.
   */
  message: string;
}

/**
 * Result of validating SEO assets before deploy.
 */
export interface SeoValidationResult {
  /**
   * Whether required SEO artifacts are present.
   */
  valid: boolean;
  /**
   * List of missing or invalid artifacts.
   */
  issues: SeoValidationIssue[];
}
