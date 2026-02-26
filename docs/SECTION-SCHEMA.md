# SECTION-SCHEMA.md - SectionDefinition Contract

## Purpose
Defines the data contract for the section library. All sections conform to this schema so the assembler and patch engine can reason about dependencies and slots.

## TypeScript Interfaces
```ts
export type SectionCategory = "universal" | "near-universal" | "shared" | "unique";

export type SlotType =
  | "text"
  | "richtext"
  | "image"
  | "icon"
  | "link"
  | "list"
  | "embed";

export interface SectionSlot {
  id: string;
  label: string;
  type: SlotType;
  required: boolean;
  maxItems?: number;
  defaultValue?: string | string[];
}

export interface SectionDefinition {
  id: string;
  name: string;
  description: string;
  category: SectionCategory;
  dependencies: string[];
  conflicts: string[];
  slots: SectionSlot[];
  files: {
    html: string;
    css: string;
    js?: string;
  };
  anchors: {
    sectionId: string;
    cssBlockId: string;
    jsFuncIds?: string[];
  };
  seo?: {
    injectBaseMeta: boolean;
  };
}
```

## File Layout
Sections live under `src/engine/templates/sections/<sectionId>/`:
- `<sectionId>.html`
- `<sectionId>.css`
- `<sectionId>.ts` (optional)

Each file must include the correct PP anchors.

## Constraints
- HTML must include `PP:SECTION` anchors.
- CSS must include `PP:BLOCK` anchors.
- JS must include `PP:FUNC` anchors.
- No inline styles.
- All CSS uses `var(--*)` tokens for colors, spacing, and fonts.
- Section class names use BEM.
- No autoplay media or modal-on-load behavior.

## Example SectionDefinition
```json
{
  "id": "hero",
  "name": "Hero",
  "description": "Primary page introduction with headline, subhead, and CTA.",
  "category": "universal",
  "dependencies": [],
  "conflicts": [],
  "slots": [
    { "id": "headline", "label": "Headline", "type": "text", "required": true },
    { "id": "subhead", "label": "Subhead", "type": "text", "required": false },
    { "id": "cta", "label": "CTA", "type": "link", "required": false }
  ],
  "files": {
    "html": "hero/hero.html",
    "css": "hero/hero.css",
    "js": "hero/hero.ts"
  },
  "anchors": {
    "sectionId": "hero",
    "cssBlockId": "hero",
    "jsFuncIds": ["hero-init"]
  },
  "seo": {
    "injectBaseMeta": false
  }
}
```
