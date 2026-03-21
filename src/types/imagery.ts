export type ImageryProvenance =
  | 'public_domain'
  | 'generated'
  | 'manual'
  | 'executor_fallback';

export type ImageryTargetSlot =
  | 'hero'
  | 'og:image'
  | 'favicon'
  | 'schema:image'
  | 'schema:contact'
  | 'logo'
  | 'general';

export interface ImageryAssetRecord {
  id: string;
  sessionId?: string;
  workItemId?: string;
  source: string;
  provenance: ImageryProvenance;
  provider?: 'openai' | 'anthropic' | 'google';
  model?: string;
  query?: string;
  prompt?: string;
  width?: number;
  height?: number;
  targetSlots: ImageryTargetSlot[];
  createdAt: number;
}
