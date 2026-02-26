/**
 * Supported zero-cost deploy hosts.
 */
export type DeployHost = 'github_pages' | 'cloudflare_pages' | 'netlify' | 'vercel';

/**
 * Deployment status values.
 */
export type DeploymentStatus = 'deploying' | 'live' | 'failed';

/**
 * Deployment record for a published site.
 */
export interface Deployment {
  /**
   * Unique deployment identifier.
   */
  id: string;
  /**
   * Session identifier associated with the deployment.
   */
  sessionId: string;
  /**
   * Host used for deployment.
   */
  host: DeployHost;
  /**
   * Live URL for the deployed site.
   */
  url: string;
  /**
   * Optional repository URL when using GitHub Pages.
   */
  repoUrl?: string;
  /**
   * Unix timestamp (ms) when deployment occurred.
   */
  deployedAt: number;
  /**
   * Size of the deployed site in bytes.
   */
  siteSize: number;
  /**
   * Number of files included in the deployment.
   */
  fileCount: number;
  /**
   * Current deployment status.
   */
  status: DeploymentStatus;
}

/**
 * Host identifiers for token validation.
 */
export type TokenValidationHost = 'github' | 'netlify' | 'cloudflare';

/**
 * Token validation status values.
 */
export type TokenValidationStatus =
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'insufficient_permissions'
  | 'unchecked';

/**
 * Result of validating a deploy token.
 */
export interface TokenValidation {
  /**
   * Host the token applies to.
   */
  host: TokenValidationHost;
  /**
   * Validation status for the token.
   */
  status: TokenValidationStatus;
  /**
   * Optional list of scopes granted to the token.
   */
  scopes?: string[];
  /**
   * Optional username associated with the token.
   */
  username?: string;
  /**
   * Unix timestamp (ms) when the token was last checked.
   */
  checkedAt?: number;
}
