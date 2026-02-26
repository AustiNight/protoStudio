# Iterative Build Engine — Technical Design

## The Core Tension

```
         CONSISTENCY                    VELOCITY
    "Don't break what works"    "Show me visible progress"
              │                         │
              └────────┬────────────────┘
                       │
               STEERABILITY
          "Respect my priorities"
```

All three must be solved simultaneously. Optimizing for any one alone is easy — it's the triangle that's hard. Here's the design.

---

## 1. Work Item Sizing: The Builder Atom

### 1.1 The Problem

If work items vary wildly in scope (one is "add a favicon" and the next is "build the entire blog system"), the user experience becomes unpredictable — sometimes they see a swap in 10 seconds, sometimes they wait 3 minutes. The PO also can't make meaningful priority tradeoffs between items of incomparable size.

### 1.2 The Solution: Atomic Decomposition Rules

Every work item must conform to a **Builder Atom** — a unit of work that produces a **single visible change** in the preview and completes within a bounded time/token budget.

#### Builder Atom Definition

| Constraint | Target | Hard Limit |
|---|---|---|
| **Files touched** | 1–3 | ≤ 5 |
| **Lines changed** | 20–80 | ≤ 150 |
| **New sections/components added** | 0–1 | ≤ 2 |
| **Builder LLM calls** | 1–2 | ≤ 3 |
| **Elapsed wall time** | 15–45 seconds | ≤ 90 seconds |
| **User-visible change** | Exactly 1 coherent change | Never 0, never "everything moved" |

> **The golden rule:** After every swap, the user should be able to point at the screen and say *"that's what changed"* in one sentence.

#### 1.3 Decomposition Strategy — The PO's Playbook

The Chat AI (PO) decomposes features into atoms using this hierarchy:

```
USER REQUEST
"I want a blog with categories and a search bar"
        │
        ▼
FEATURE (too large — decompose)
"Blog system with categories and search"
        │
        ├──► ATOM: Add blog listing page with 3 placeholder posts
        ├──► ATOM: Add blog post detail page with back-link
        ├──► ATOM: Add category tags to posts with filter UI
        ├──► ATOM: Add search bar to blog listing (client-side)
        ├──► ATOM: Add RSS feed generation
        └──► ATOM: Add blog link to main navigation
```

The PO applies these decomposition rules:

```markdown
## Atom Decomposition Rules (used by Chat AI / PO)

1. STRUCTURAL FIRST: If the feature needs a new page, the first atom
   creates the page skeleton with placeholder content. Never build
   content + structure in the same atom.

2. ONE CONCERN PER ATOM: An atom is either:
   - Layout/structure (new section, new page, nav update)
   - Content/copy (text, images, placeholder replacement)
   - Styling/theming (colors, fonts, spacing, responsive tweaks)
   - Behavior (interactivity, form logic, animations)
   - Integration (external service, embed, API call)
   Never mix categories in one atom.

3. VISIBLE DELTA: Every atom must produce a change the user can see
   in the preview. No "refactor-only" or "prep-only" atoms — those
   get folded into the atom that produces the visible result.

4. DEPENDENCY CHAIN: If Atom B depends on Atom A, they must be
   ordered A → B. But prefer independent atoms that can be built
   in any order.

5. MAX NESTING DEPTH = 1: A feature decomposes into atoms. Atoms
   do not decompose further. If an atom feels too large, it's
   actually two atoms.

6. SIZE CHECK: After decomposition, PO self-audits each atom against
   the Builder Atom constraints table. Any atom exceeding hard
   limits gets re-split.
```

#### 1.4 PO Self-Audit Prompt Excerpt

This is injected into the Chat AI's context when generating backlog items:

```markdown
## Backlog Item Sizing — Self-Audit

For EACH work item you generate, verify:
- [ ] Touches ≤ 5 files
- [ ] Changes ≤ 150 lines
- [ ] Adds at most 1 new section or component
- [ ] Produces exactly 1 user-visible change
- [ ] Can be described in a single sentence
- [ ] No mixed concerns (structure + style = 2 atoms)
- [ ] Has no hidden sub-tasks that would require a second build

If any check fails, split the item and re-verify.

Output each work item with:
{
  "title": "...",
  "description": "...",
  "atomType": "structure | content | style | behavior | integration",
  "filesTouch": ["index.html", "css/style.css"],
  "estimatedLines": 45,
  "visibleChange": "A new Services section appears on the homepage
                    with 3 placeholder cards",
  "dependencies": []
}
```

#### 1.5 Why This Works

| Property | How Atoms Achieve It |
|---|---|
| **Predictable swap cadence** | Every atom completes in 15–90 seconds; user sees steady progress |
| **Meaningful reveals** | Each swap shows exactly one visible change — not too small to notice, not so large it's disorienting |
| **PO can reason about priority** | Atoms are comparable: "add search bar" vs. "add category filter" are both one atom; user can meaningfully choose |
| **Builder can execute reliably** | Small scope = fewer LLM hallucination opportunities = higher success rate per build |

---

## 2. Incremental Patching: Never Rewrite, Always Patch

### 2.1 The Problem

If the Builder AI regenerates the entire site from scratch for each work item, three bad things happen:

1. **Regressions** — completed work gets lost or subtly altered
2. **Style drift** — fonts, spacing, colors shift unpredictably
3. **Wasted tokens** — regenerating 2000 lines to change 40

### 2.2 The Solution: Section-Anchored Patch Protocol

The VFS is not treated as an opaque blob. It has **architectural scaffolding** established during the first build and then **never regenerated** — only patched.

#### 2.2.1 Architectural Scaffold (set once, on first build)

The very first build (whether template or scratch) establishes a **scaffold** — the structural skeleton of the site. This scaffold is the source of truth for where things live:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><!-- PP:TITLE --></title>
  <!-- PP:HEAD_META -->
  <link rel="stylesheet" href="css/style.css">
  <!-- PP:HEAD_EXTRA -->
</head>
<body>
  <!-- PP:SECTION:nav -->
  <nav class="site-nav" data-pp-section="nav">
    ...
  </nav>
  <!-- /PP:SECTION:nav -->

  <main>
    <!-- PP:SECTION:hero -->
    <section class="hero" data-pp-section="hero">
      ...
    </section>
    <!-- /PP:SECTION:hero -->

    <!-- PP:SECTION:features -->
    <section class="features" data-pp-section="features">
      ...
    </section>
    <!-- /PP:SECTION:features -->

    <!-- PP:SECTION:about -->
    <section class="about" data-pp-section="about">
      ...
    </section>
    <!-- /PP:SECTION:about -->

    <!-- PP:INSERT_BEFORE:footer -->
  </main>

  <!-- PP:SECTION:footer -->
  <footer class="site-footer" data-pp-section="footer">
    ...
  </footer>
  <!-- /PP:SECTION:footer -->

  <script src="js/main.js"></script>
  <!-- PP:SCRIPTS_EXTRA -->
</body>
</html>
```

**Key features of the scaffold:**
- `<!-- PP:SECTION:name -->` comment anchors wrap every discrete section
- `data-pp-section="name"` attributes on the root element of each section
- `<!-- PP:INSERT_BEFORE:name -->` markers indicate where new sections can be injected
- The scaffold defines the **page structure** — the Builder only ever modifies content *within* sections or inserts new sections at designated points

#### 2.2.2 The Patch Format

The Builder AI **never outputs a full file.** It outputs a **patch** — a structured instruction set that describes what to change:

```typescript
interface BuildPatch {
  workItemId: string;
  targetVersion: number;        // Must match current VFS version (optimistic lock)
  operations: PatchOperation[];
}

type PatchOperation =
  | SectionReplace       // Replace contents of a named section
  | SectionInsert        // Insert a new section at a designated point
  | SectionDelete        // Remove a named section
  | CssAppend            // Append rules to stylesheet
  | CssReplaceBlock      // Replace a named CSS block
  | JsAppend             // Append to script
  | JsReplaceFunction    // Replace a named function
  | FileCreate           // Create a new file (new page)
  | FileDelete           // Delete a file
  | MetadataUpdate;      // Update title, colors, fonts, etc.

// Examples:
interface SectionReplace {
  op: 'section_replace';
  file: string;                  // e.g., "index.html"
  section: string;               // e.g., "hero"
  newContent: string;            // Inner HTML only — anchors preserved
}

interface SectionInsert {
  op: 'section_insert';
  file: string;
  insertBefore: string;          // e.g., "footer"
  sectionName: string;           // e.g., "testimonials"
  content: string;               // Full section HTML with anchors
}

interface CssReplaceBlock {
  op: 'css_replace_block';
  file: string;                  // e.g., "css/style.css"
  blockName: string;             // e.g., "hero-styles"
  newContent: string;
}
```

#### 2.2.3 CSS is Also Scaffolded

The stylesheet uses named blocks with comment anchors, mirroring the HTML:

```css
/* === PP:BLOCK:variables === */
:root {
  --color-primary: #007AFF;
  --color-secondary: #5856D6;
  --color-bg: #FFFFFF;
  --color-text: #1C1C1E;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --spacing-section: clamp(3rem, 8vw, 6rem);
}
/* === /PP:BLOCK:variables === */

/* === PP:BLOCK:reset === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
/* === /PP:BLOCK:reset === */

/* === PP:BLOCK:nav-styles === */
.site-nav { ... }
/* === /PP:BLOCK:nav-styles === */

/* === PP:BLOCK:hero-styles === */
.hero { ... }
/* === /PP:BLOCK:hero-styles === */

/* PP:CSS_INSERT_POINT */
```

**The Builder can:**
- Replace the contents of any named block
- Append new blocks at `PP:CSS_INSERT_POINT`
- Modify CSS custom properties in the `:root` block (for theming)

**The Builder cannot:**
- Rewrite the entire stylesheet
- Remove structural blocks without an explicit `SectionDelete` operation
- Move blocks relative to each other (order is scaffold-defined)

#### 2.2.4 JavaScript is Similarly Anchored

```javascript
// === PP:FUNC:initNav ===
function initNav() { ... }
// === /PP:FUNC:initNav ===

// === PP:FUNC:initContactForm ===
function initContactForm() { ... }
// === /PP:FUNC:initContactForm ===

// PP:JS_INSERT_POINT

// === PP:FUNC:main ===
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initContactForm();
  // PP:MAIN_CALLS
});
// === /PP:FUNC:main ===
```

#### 2.2.5 The Patch Application Engine

```typescript
class PatchEngine {
  apply(vfs: VirtualFileSystem, patch: BuildPatch): PatchResult {
    // 1. OPTIMISTIC LOCK CHECK
    if (patch.targetVersion !== vfs.version) {
      return { success: false, error: 'version_conflict' };
    }

    // 2. DRY RUN — apply to a clone, validate
    const clone = this.cloneVFS(vfs);
    for (const op of patch.operations) {
      const result = this.applyOperation(clone, op);
      if (!result.success) {
        return { success: false, error: result.error, failedOp: op };
      }
    }

    // 3. VALIDATE — check scaffold integrity
    const scaffoldIntact = this.validateScaffold(clone);
    if (!scaffoldIntact) {
      return { success: false, error: 'scaffold_violation' };
    }

    // 4. COMMIT — apply to real VFS, increment version
    for (const op of patch.operations) {
      this.applyOperation(vfs, op);
    }
    vfs.version++;

    return { success: true, version: vfs.version };
  }

  private validateScaffold(vfs: VirtualFileSystem): boolean {
    // Verify all PP:SECTION anchors are still present and properly nested
    // Verify all PP:BLOCK anchors in CSS are intact
    // Verify all PP:FUNC anchors in JS are intact
    // Verify no orphaned closing anchors
    // Verify data-pp-section attributes match anchor names
    return true; // or false with diagnostic
  }
}
```

#### 2.2.6 Why Patches, Not Full Files?

| Dimension | Full-File Regeneration | Section-Anchored Patches |
|---|---|---|
| **Regressions** | High — LLM may forget or subtly alter completed work | Near zero — untouched sections are literally untouched |
| **Token cost** | High — regenerate 2000+ lines per build | Low — only the changed section (20–80 lines) |
| **Builder reliability** | Low — larger output = more hallucination surface | High — constrained output with clear anchors |
| **Diff visibility** | Hard to tell what changed | Trivially auditable — patch operations are the diff |
| **Rollback** | Complex — which version had the right hero? | Simple — reverse the patch operations |
| **Scaffold integrity** | No guarantee structure is preserved | Enforced — `validateScaffold()` runs on every patch |

---

## 3. Continuity Protocol: Steerability + Velocity

### 3.1 The Problem

The user needs to feel three things simultaneously:
- **"I can see progress"** — every swap shows a meaningful visible change
- **"It's listening to me"** — my priorities and feedback are reflected
- **"It's still my site"** — the overall look, feel, and structure are consistent

### 3.2 The Solution: Builder Context Window Management

The Builder AI receives a carefully curated context for each build that includes enough about the existing site to maintain continuity, but not so much that it's tempted to rewrite things.

#### 3.2.1 Builder Context Composition

For each build, the Builder AI receives:

```
┌─────────────────────────────────────────────────────────────┐
│                    BUILDER CONTEXT                            │
│                                                               │
│  1. SYSTEM PROMPT (static — see §9.2)                        │
│                                                               │
│  2. SITE MANIFEST (always included, ~200 tokens)             │
│     {                                                         │
│       "title": "Joe's Plumbing",                             │
│       "template": "small_business",                          │
│       "vfsVersion": 7,                                       │
│       "pages": ["index.html", "about.html", "contact.html"],│
│       "sections": {                                           │
│         "index.html": ["nav","hero","services","about",      │
│                         "testimonials","footer"],             │
│         ...                                                   │
│       },                                                      │
│       "cssBlocks": ["variables","reset","nav-styles",...],   │
│       "jsFunctions": ["initNav","initContactForm",...],      │
│       "themeColors": { "primary": "#007AFF", ... },          │
│       "fonts": { "heading": "Inter", "body": "Inter" }      │
│     }                                                         │
│                                                               │
│  3. AFFECTED SECTIONS ONLY (~200-800 tokens)                 │
│     The current content of ONLY the sections this atom       │
│     will modify or needs to be adjacent to.                  │
│     NOT the entire site.                                     │
│                                                               │
│  4. WORK ITEM (the atom to build, ~100 tokens)               │
│     {                                                         │
│       "title": "Add testimonials section to homepage",       │
│       "atomType": "structure",                               │
│       "visibleChange": "New testimonials section appears     │
│                         between services and footer",        │
│       "filesTouch": ["index.html", "css/style.css"]          │
│     }                                                         │
│                                                               │
│  5. PATCH FORMAT INSTRUCTIONS (~150 tokens)                  │
│     How to structure the output as PatchOperations.          │
│                                                               │
│  Total: ~650-1250 tokens of context                          │
│  (vs. ~3000-5000 if we sent the full site)                   │
└─────────────────────────────────────────────────────────────┘
```

**Critical constraint: The Builder never sees the full site.** It sees:
- The manifest (what exists, where)
- The CSS variables block (for theming consistency)
- Only the sections it's modifying or inserting adjacent to
- The work item instructions

This makes it **structurally impossible** for the Builder to rewrite unrelated sections, because it doesn't have them in context.

#### 3.2.2 The Adjacent Section Rule

When the Builder needs to insert a new section, it receives the sections immediately before and after the insertion point — but as **read-only context**, not as content to modify:

```markdown
## Builder Instruction for: "Add testimonials section"

### Read-Only Context (DO NOT MODIFY)
The section immediately above your insertion point:
<!-- PP:SECTION:services -->
<section class="services" data-pp-section="services">
  [current services content shown here]
</section>
<!-- /PP:SECTION:services -->

### Your Task
Insert a new section "testimonials" between "services" and "footer".
Output a SectionInsert patch operation.
Match the visual style, spacing, and typography of adjacent sections.

### Read-Only Context (DO NOT MODIFY)
The section immediately below your insertion point:
<!-- PP:SECTION:footer -->
[footer content shown here]
```

This gives the Builder enough context to match visual rhythm and spacing **without** giving it the opportunity to alter adjacent content.

#### 3.2.3 Theming Consistency via CSS Custom Properties

The most common source of "it doesn't feel like the same site anymore" is color/font/spacing drift. The scaffold prevents this architecturally:

```
┌──────────────────────────────────────────────┐
│  CSS Custom Properties (:root block)          │
│  ─────────────────────────────────────────── │
│  Set ONCE during initial build.               │
│  Modified ONLY by explicit "style" atoms.     │
│  Every section references these variables.    │
│  Builder MUST use var(--color-primary) etc.   │
│  Builder MUST NOT use hardcoded hex values.   │
└──────────────────────────────────────────────┘
         │
         │ referenced by
         ▼
┌──────────────────────────────────────────────┐
│  Every CSS block in the stylesheet            │
│  .hero { color: var(--color-text); }          │
│  .services { background: var(--color-bg); }   │
│  .testimonials { ... var(--color-primary) } ← new section                    │
│                     automatically matches     │
└──────────────────────────────────────────────┘
```

**If the user says "change the primary color to green":**
- That's a single "style" atom
- The patch modifies ONE line in the `:root` block
- Every section that references `var(--color-primary)` updates automatically
- Zero risk of drift

#### 3.2.4 The Continuity Checklist (Post-Patch Validation)

After every patch is applied but **before** the blue/green swap, the Preview Engine runs a continuity check:

```typescript
interface ContinuityCheck {
  name: string;
  check: (before: VirtualFileSystem, after: VirtualFileSystem) => ContinuityResult;
}

const continuityChecks: ContinuityCheck[] = [
  {
    name: 'scaffold_intact',
    // All PP:SECTION anchors from 'before' still exist in 'after'
    // (unless the atom explicitly deleted a section)
  },
  {
    name: 'theme_consistent',
    // :root CSS variables haven't changed
    // (unless this atom's type is 'style')
  },
  {
    name: 'nav_consistent',
    // Navigation links haven't changed
    // (unless this atom explicitly modifies nav)
  },
  {
    name: 'no_unrelated_changes',
    // Only files listed in the atom's filesTouch are modified
    // Any other file diff = violation
  },
  {
    name: 'section_count_delta',
    // Sections added/removed matches atom's expected delta
    // (e.g., a structure atom adding 1 section should result in +1)
  },
  {
    name: 'css_variable_usage',
    // New CSS in the patch uses var(--...) for colors/fonts/spacing
    // No hardcoded hex values in new CSS rules
  },
];

async function validateContinuity(
  before: VirtualFileSystem,
  after: VirtualFileSystem,
  atom: WorkItem,
): Promise<{ pass: boolean; violations: string[] }> {
  const violations: string[] = [];
  for (const check of continuityChecks) {
    const result = check.check(before, after);
    if (!result.pass) violations.push(`${check.name}: ${result.reason}`);
  }
  return { pass: violations.length === 0, violations };
}
```

**If continuity validation fails:**

```
Patch applied → Continuity check FAILS
        │
        ▼
┌─────────────────────────────┐
│ Do NOT swap to Green.        │
│ Log violation.               │
│ Discard patch.               │
│ Send Builder a retry prompt  │
│ with the violation details.  │
│ (max 2 retries, then skip   │
│  this atom and report to PO) │
└─────────────────────────────┘
```

### 3.3 The Full Build Cycle — Putting It All Together

```
                        PO generates backlog
                              │
                   ┌──────────▼──────────┐
                   │   ATOM on On Deck    │
                   │   {                  │
                   │     title: "...",    │
                   │     atomType: "...", │
                   │     filesTouch: [...] │
                   │   }                  │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │ CONTEXT ASSEMBLY     │
                   │ • Site manifest      │
                   │ • CSS :root block    │
                   │ • Affected sections  │
                   │ • Adjacent sections  │
                   │   (read-only)        │
                   │ • Atom instructions  │
                   │ • Patch format spec  │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │ BUILDER AI           │
                   │ Generates patch      │
                   │ (not full files)     │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │ PATCH VALIDATION     │
                   │ • Schema valid?      │
                   │ • Version matches?   │
                   │ • Scaffold intact?   │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │ APPLY TO VFS CLONE   │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │ CONTINUITY CHECK     │
                   │ • Theme consistent?  │
                   │ • Nav untouched?     │
                   │ • No unrelated diffs?│
                   │ • CSS vars used?     │
                   └──────────┬──────────┘
                         │         │
                      PASS       FAIL
                         │         │
              ┌──────────▼──┐  ┌──▼──────────┐
              │ BUILD CHECK  │  │ RETRY       │
              │ • Renders?   │  │ (max 2)     │
              │ • No errors? │  │ Include     │
              │ • A11y pass? │  │ violation   │
              └──────┬───────┘  │ in prompt   │
                     │          └─────────────┘
                  PASS
                     │
              ┌──────▼───────┐
              │ COMMIT VFS    │
              │ version++     │
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ INJECT INTO   │
              │ GREEN IFRAME  │
              │ (srcdoc)      │
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ SWAP          │     ← User sees the change
              │ Green → Live  │
              │ Blue → Next   │
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ PROMOTE NEXT  │
              │ On Deck item  │
              │ Begin again ──┼──────► (loop)
              └──────────────┘
```

### 3.4 What the User Experiences

Here's a concrete timeline for a "Small Business" template session:

| Time | Swap # | What Changed | User Sees |
|---|---|---|---|
| 0:00 | — | First message: "I'm a plumber in Austin called Joe's Plumbing" | ChlorastroliteLoader |
| 0:18 | 1 | Template deployed with Title, Logo SVG, Slogan, Blue/Teal palette | Full site: Home, About, Contact with Joe's Plumbing branding |
| 0:45 | 2 | Hero copy customized: tagline, CTA button text | Hero text changes from placeholder to "Reliable Plumbing in Austin Since 2015" |
| 1:10 | 3 | Services section: 4 cards (Repairs, Installation, Emergency, Inspection) | New services grid appears between hero and about |
| 1:35 | 4 | Contact form wired to Formspree; map shows Austin, TX | Contact page map pins to Austin; form has submit button |
| 1:55 | 5 | About section: AI-written copy about Joe's experience | About text changes from placeholder to personalized narrative |
| 2:20 | 6 | Testimonials section with 3 placeholder reviews | New section appears between services and footer |
| 2:40 | 7 | Hours/location widget added to footer | Footer expands with business hours table |
| 3:00 | 8 | Meta tags, Open Graph, structured data (SEO atom) | No visible change — PO notes "SEO optimized" in chat |
| 3:15 | 9 | Sitemap.xml and robots.txt generated | No visible change — PO notes in chat |

**Key observations:**
- Every swap takes 20–40 seconds — predictable cadence
- Each swap has one clear visible change
- The site "grows" in a logical, additive way
- The hero from swap #1 still looks identical at swap #9
- Theme colors set in swap #1 carry through everything

### 3.5 Handling User Steering Mid-Build

When the user focuses a backlog item and chats about it, the PO may modify the atom's instructions. But the protocol has rules:

| User Action | PO Response | Build Impact |
|---|---|---|
| User re-orders backlog | PO approves or denies | Builder picks up whatever is On Deck; no impact on current build |
| User focuses a backlog item and requests changes | PO modifies the atom's description and `visibleChange` | If the modified atom is On Deck and builder hasn't started, update it. If builder is mid-build, queue the modification for a follow-up atom. |
| User says "I don't like the hero colors" while builder is working on services | PO creates a new "style" atom: "Adjust hero palette" and places it appropriately in backlog | Current build (services) is unaffected. Color fix comes in a future swap. |
| User pauses work | Builder finishes current atom but does not pick up On Deck | User has time to review and provide feedback |
| User says "Actually, scrap the testimonials" | PO marks the testimonials atom as deleted from backlog. If testimonials were already built, PO creates a new atom: "Remove testimonials section" | Clean removal via `SectionDelete` patch operation |

---

## 4. Integrated Safeguards Summary

| Concern | Mechanism | Enforcement Point |
|---|---|---|
| Work items are similar size | Builder Atom constraints + PO self-audit decomposition rules | PO prompt at backlog generation time |
| Site isn't rewritten each time | Section-anchored scaffold + patch-only output + Builder never sees full site | Builder prompt + Patch Engine + Scaffold validation |
| Theme consistency | CSS custom properties + `css_variable_usage` continuity check | Builder prompt + Post-patch validation |
| Navigation consistency | `nav_consistent` continuity check | Post-patch validation |
| No unrelated changes | Builder only receives affected files + `no_unrelated_changes` check | Context assembly + Post-patch validation |
| Failed patches don't break the preview | Patch applied to VFS clone first; blue/green swap only after all checks pass | Patch Engine dry-run + Preview Engine |
| Bad atoms can be retried | Up to 2 retries with violation details in prompt; then skip and report | Build cycle retry logic |
| User can steer without disrupting builds | PO queues changes as new atoms; current build is never interrupted mid-execution | PO conversation management |

---

## 5. New/Updated PRD Artifacts

The following should be integrated into the consolidated PRD:

### 5.1 New Interface Definitions (add to §7.1)

```typescript
// Builder Atom metadata (extends WorkItem)
interface WorkItem {
  // ... existing fields from PRD ...
  atomType: 'structure' | 'content' | 'style' | 'behavior' | 'integration';
  filesTouch: string[];
  estimatedLines: number;
  visibleChange: string;
}

// Build Patch
interface BuildPatch {
  workItemId: string;
  targetVersion: number;
  operations: PatchOperation[];
}

// Patch Result
interface PatchResult {
  success: boolean;
  version?: number;
  error?: string;
  failedOp?: PatchOperation;
  violations?: string[];
  retryCount?: number;
}
```

### 5.2 New Subsystem: Patch Engine (add to §2.2)

| Subsystem | Responsibility |
|---|---|
| **Patch Engine** | Applies structured patches to VFS; validates scaffold integrity; enforces continuity checks; manages retry logic |

### 5.3 Updated Builder AI Prompt Addition (append to §9.2)

```markdown
## Output Format — CRITICAL
You MUST output a BuildPatch JSON object. You MUST NOT output full files.

Your patch targets version {vfsVersion}. If your patch modifies anything
not listed in the work item's filesTouch, it will be rejected.

### Rules:
1. Use SectionReplace to modify existing section content.
2. Use SectionInsert to add new sections at PP:INSERT_BEFORE points.
3. Use CssReplaceBlock or CssAppend for style changes.
4. ALWAYS reference CSS custom properties: var(--color-primary), etc.
   NEVER use hardcoded color hex values in new CSS.
5. Adjacent sections are provided as READ-ONLY CONTEXT. Do not include
   them in your patch. They exist so you can match visual rhythm.
6. Your output must parse as valid JSON matching the BuildPatch schema.
```

---
