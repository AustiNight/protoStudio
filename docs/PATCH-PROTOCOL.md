# PATCH-PROTOCOL.md - Section Anchors and Patch Ops

## Purpose
This protocol defines how the Builder updates a site without rewriting files. It is the only allowed write path to the site scaffold.

## Anchor Conventions
Anchors must be present and intact. They define safe patch boundaries.

### HTML Sections
```html
<!-- PP:SECTION:hero -->
<section class="hero" data-pp-section="hero">
  ...
</section>
<!-- /PP:SECTION:hero -->
```

### HTML Insert Points
```html
<!-- PP:INSERT_BEFORE:footer -->
```

### CSS Blocks
```css
/* PP:BLOCK:hero */
.hero {
  color: var(--text-primary);
}
/* /PP:BLOCK:hero */
```

### JS Functions
```js
// PP:FUNC:hero-init
function initHero() {
  // ...
}
// /PP:FUNC:hero-init
```

## Patch Output Rules (Builder)
- Output JSON patch ops only. No prose.
- Do not emit full files. Patch only within anchors.
- Respect Builder Atom limits (<= 5 files, <= 150 lines, one visible change).
- All generated site CSS uses `var(--*)` for color, spacing, and font tokens.
- All generated site class names use BEM.
- No inline styles.
- No third-party trackers. No `eval` or dynamic script injection.

## Patch Operation Types
Each operation is an object. The engine applies them in order.

### Common Fields
- `op`: string
- `file`: string (path in VFS)
- `ifVersion`: number (expected file version)

### Operations

#### 1) `section.replace`
Replace an entire anchored section.
```json
{
  "op": "section.replace",
  "file": "index.html",
  "sectionId": "hero",
  "html": "<section ...>...</section>",
  "ifVersion": 3
}
```

#### 2) `section.insert`
Insert a new section before an insert marker.
```json
{
  "op": "section.insert",
  "file": "index.html",
  "before": "footer",
  "sectionId": "testimonials",
  "html": "<section ...>...</section>",
  "ifVersion": 3
}
```

#### 3) `section.delete`
Remove a section by anchor.
```json
{
  "op": "section.delete",
  "file": "index.html",
  "sectionId": "cta",
  "ifVersion": 3
}
```

#### 4) `css.append`
Append a new CSS block.
```json
{
  "op": "css.append",
  "file": "css/style.css",
  "blockId": "testimonials",
  "css": "/* PP:BLOCK:testimonials */ ... /* /PP:BLOCK:testimonials */",
  "ifVersion": 7
}
```

#### 5) `css.replace`
Replace an existing CSS block by block id.
```json
{
  "op": "css.replace",
  "file": "css/style.css",
  "blockId": "hero",
  "css": "/* PP:BLOCK:hero */ ... /* /PP:BLOCK:hero */",
  "ifVersion": 7
}
```

#### 6) `js.append`
Append a new JS function block.
```json
{
  "op": "js.append",
  "file": "js/main.js",
  "funcId": "hero-init",
  "js": "// PP:FUNC:hero-init ... // /PP:FUNC:hero-init",
  "ifVersion": 2
}
```

#### 7) `js.replace`
Replace an existing JS function block by func id.
```json
{
  "op": "js.replace",
  "file": "js/main.js",
  "funcId": "hero-init",
  "js": "// PP:FUNC:hero-init ... // /PP:FUNC:hero-init",
  "ifVersion": 2
}
```

#### 8) `file.create`
Create a new file (used sparingly).
```json
{
  "op": "file.create",
  "file": "pages/blog.html",
  "content": "<!doctype html>...",
  "ifAbsent": true
}
```

#### 9) `file.delete`
Delete a file by path.
```json
{
  "op": "file.delete",
  "file": "pages/old.html",
  "ifVersion": 1
}
```

#### 10) `meta.update`
Update VFS metadata (e.g., title, description).
```json
{
  "op": "meta.update",
  "file": "index.html",
  "fields": {
    "title": "New Title"
  }
}
```

## Validation Rules
- All anchors must be present before and after patch.
- `ifVersion` must match the current file version or the patch is rejected.
- New sections must include valid PP anchors.
- CSS blocks must use `var(--*)` tokens. No hex colors.
- Autoplay media, modal-on-load, and dark patterns are rejected.

## Example Patch (Array)
```json
[
  {
    "op": "section.replace",
    "file": "index.html",
    "sectionId": "hero",
    "html": "<section class=\"hero\" data-pp-section=\"hero\">...</section>",
    "ifVersion": 4
  },
  {
    "op": "css.replace",
    "file": "css/style.css",
    "blockId": "hero",
    "css": "/* PP:BLOCK:hero */ .hero { color: var(--text-primary); } /* /PP:BLOCK:hero */",
    "ifVersion": 9
  }
]
```
