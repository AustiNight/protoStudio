# prontoproto.studio — Product Requirements Document

> **Product:** prontoproto.studio — AI-Powered Website Creation Studio
> **Version:** 1.2 (MVP — Consolidated)
> **Author:** Jonathan Aulson (Product & Solution Architect)
> **Date:** February 25, 2026
> **Status:** Approved for Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Architecture Overview](#2-product-architecture-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Technical Architecture](#5-technical-architecture)
6. [Zero-Cost Solution Playbook](#6-zero-cost-solution-playbook)
7. [Data Model](#7-data-model)
8. [UI/UX Specification](#8-uiux-specification)
9. [System Prompts](#9-system-prompts)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Key Design Decisions & Rationale](#11-key-design-decisions--rationale)
12. [Risk Register](#12-risk-register)
13. [Derived Requirements](#13-derived-requirements)
14. [Deferred Features](#14-deferred-features)
15. [Glossary](#15-glossary)

---

## 1. Executive Summary

### 1.1 Vision

prontoproto.studio is an AI-powered website creation studio that transforms a simple chat conversation into a fully deployed, production-ready website. It combines a curated library of pre-built configurable template apps (covering ≥80% of user requests) with an intelligent backlog-driven development pipeline, delivering a working preview in seconds and iteratively enhancing it via a blue/green swap strategy — all while aggressively minimizing cost for both the operator and the end user.

### 1.2 Business Value

| Dimension | Value Proposition |
|---|---|
| **Speed** | First working preview in <30 seconds for template-path users |
| **Cost** | Zero-cost hosting for ≥95% of generated sites; studio operating costs minimized via free-tier infrastructure |
| **Expertise** | Studio acts as a design-literate Product Owner — users get modern web best practices without learning them |
| **Simplicity** | One-click deploy; documentation packet for post-deploy configuration |
| **Accessibility** | Non-technical indie founders, artists, tradespeople, and bloggers can ship real websites via chat |

### 1.3 Target Audience

| Segment | Description |
|---|---|
| **Indie Founders** | Building MVPs, landing pages, SaaS marketing sites |
| **Small Business Owners** | Restaurants, salons, contractors, clinics needing an online presence |
| **Artists & Creatives** | Portfolio sites, galleries, personal branding |
| **Tradespeople** | Plumbers, electricians, landscapers — brochure + contact sites |
| **Bloggers** | Content-first sites with modern layouts |

> **Key trait:** Familiar with chat-based AI, but zero experience with deployment, hosting, DNS, or design theory.

### 1.4 Usage Profile

| Metric | Expectation |
|---|---|
| Concurrent users | 1 (single-user, no concurrency) |
| Active sessions per day | <10 total; typically 1–2 |
| User base | Select clients, friends, and family |
| Session model | Single active session (no multi-session switching for MVP) |

---

## 2. Product Architecture Overview

### 2.1 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        prontoproto.studio UI                         │
│  ┌─────────────────────┐   ┌──────────────────────────────────────┐  │
│  │   iMessage-Style    │   │         Preview Iframe               │  │
│  │   Chat Thread       │   │  ┌──────────┐  ┌──────────────────┐ │  │
│  │                     │   │  │  BLUE     │  │  GREEN           │ │  │
│  │  [User Messages]    │   │  │  (live)   │  │  (building)      │ │  │
│  │  [AI Responses]     │   │  │          ◄├──┤  swap on ready   │ │  │
│  │  [System Events]    │   │  └──────────┘  └──────────────────┘ │  │
│  │                     │   └──────────────────────────────────────┘  │
│  │  [Cost Ticker $]    │   ┌──────────────────────────────────────┐  │
│  └─────────────────────┘   │         Backlog Panel                │  │
│                            │  ┌──────────┐ ┌────────────────────┐ │  │
│                            │  │ ON DECK  │ │  BACKLOG (ordered) │ │  │
│                            │  │ (locked) │ │  • Drag/drop       │ │  │
│                            │  │          │ │  • Click-to-focus  │ │  │
│                            │  │          │ │  • Pause/Resume    │ │  │
│                            │  └──────────┘ └────────────────────┘ │  │
│                            └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
        │  Chat AI     │  │  Builder AI  │  │  Deploy Engine   │
        │  (Product    │  │  (Code Gen   │  │  (GitHub API →   │
        │   Owner)     │  │   + Preview) │  │   Pages/Netlify/ │
        │              │  │              │  │   CF Pages)      │
        └──────┬───────┘  └──────┬───────┘  └──────────────────┘
               │                 │
               ▼                 ▼
        ┌──────────────────────────────┐
        │  LLM Gateway (configurable)  │
        │  • OpenAI  • Anthropic       │
        │  • Google  (user API keys)   │
        └──────────────────────────────┘
```

### 2.2 Core Subsystems

| Subsystem | Responsibility |
|---|---|
| **Chat AI (Product Owner)** | Interprets user intent, generates/refines backlog, enforces best practices, manages conversation flow |
| **Builder AI (Developer)** | Generates HTML/CSS/JS code, applies template configurations, builds iterative patches |
| **Preview Engine** | Blue/green iframe swap, sandboxed rendering, `postMessage` bridge, ChlorastroliteLoader animation |
| **Backlog Manager** | Ordered work item list, On Deck locking, drag/drop with PO override, focus/chat, pause/resume |
| **Deploy Engine** | Automated single-click deployment to zero-cost hosts, token-based auth, documentation generation |
| **LLM Gateway** | Unified interface to OpenAI/Anthropic/Google; user-provided API keys; cost tracking |
| **Template Library** | Pre-built configurable apps for common verticals with shared base components |

---

## 3. Functional Requirements

### Epic 1: Chat Interface & Conversation Management

#### Feature 1.1: iMessage-Style Chat Thread

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-1.1.1** | As a user, I can type messages in an iMessage-style chat interface so that interaction feels familiar and approachable | Chat bubbles with sender alignment (user right, AI left); rounded corners; timestamp; typing indicator; auto-scroll to latest |
| **US-1.1.2** | As a user, I see system event messages (build started, deploy complete, etc.) inline in the chat | System messages styled distinctly (centered, muted color, icon prefix) |
| **US-1.1.3** | As a user, I can click "New Conversation" to reset the studio | Confirmation dialog if session has content; preview area clears and shows ChlorastroliteLoader; chat clears; backlog clears; builder stops; LLM config and settings preserved |
| **US-1.1.4** | As a user, I can see a running cost estimate for the current conversation | Ticker displays cumulative LLM API token cost in USD; updates after each LLM call; hover tooltip shows breakdown by role (Chat AI / Builder AI), model, call count, and token totals |

#### Feature 1.2: LLM Configuration

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-1.2.1** | As a user, I can input my API keys for OpenAI, Anthropic, and Google in a settings panel | Keys stored in browser `localStorage` (AES-256 encrypted); never sent to any server other than the LLM provider; validation ping on save |
| **US-1.2.2** | As a user, I can select which model to use for Chat AI and Builder AI independently | Dropdown per role; persist selection in `localStorage`; default to sensible model if none chosen |
| **US-1.2.3** | As a user, I can see an easy-to-understand running total cost for my current conversation | Cost displayed in format `$0.42 this session`; hover breakdown: `Chat: $0.18 (14 calls, gpt-4o-mini) · Builder: $0.24 (6 calls, claude-sonnet)` |

#### Feature 1.3: Cost Calculation

```typescript
// Model pricing table — stored as JSON config, not hardcoded in logic
const MODEL_PRICING: Record<string, { promptPer1K: number; completionPer1K: number }> = {
  // OpenAI
  'gpt-4o':              { promptPer1K: 0.0025,  completionPer1K: 0.01 },
  'gpt-4o-mini':         { promptPer1K: 0.00015, completionPer1K: 0.0006 },
  'gpt-4.5-preview':     { promptPer1K: 0.075,   completionPer1K: 0.15 },
  // Anthropic
  'claude-sonnet-4-20250514':  { promptPer1K: 0.003,  completionPer1K: 0.015 },
  'claude-3-5-haiku-20241022': { promptPer1K: 0.0008, completionPer1K: 0.004 },
  // Google
  'gemini-2.0-flash':    { promptPer1K: 0.0001,  completionPer1K: 0.0004 },
  'gemini-2.5-pro':      { promptPer1K: 0.00125, completionPer1K: 0.01 },
};

function calculateCost(model: string, usage: TokenUsage): number {
  const rates = MODEL_PRICING[model];
  if (!rates) return 0; // Unknown model — display "Cost: unknown"
  return (
    (usage.promptTokens / 1000) * rates.promptPer1K +
    (usage.completionTokens / 1000) * rates.completionPer1K
  );
}
```

> If a model is not in the pricing table, display `"Cost: unknown"` with a tooltip. Include a "Pricing last updated" date in the tooltip.

---

### Epic 2: Template Library & First-Message Routing

#### Feature 2.1: Template App Configurations

The template library provides pre-built, configurable web app scaffolds that cover common verticals. Every template shares a **common base** of components.

##### 2.1.1 Common Base Components (all templates)

| Component | Description | Customization Points |
|---|---|---|
| **Home Page** | Hero section with Title, Logo, Slogan | Title text, logo (AI-generated SVG), slogan text, hero background |
| **About Us** | Company/personal story section | Copy, image, layout (left-img/right-img/full-width) |
| **Contact Us** | Map widget + form-to-email | Address (for map pin), email recipient, form fields, submit behavior |
| **Navigation** | Responsive top nav + mobile hamburger | Links, logo placement, sticky vs. static |
| **Footer** | Social links, copyright, secondary nav | Social URLs, copyright text, columns |
| **SEO Base** | Meta tags, Open Graph, structured data | Title, description, image, keywords |
| **Favicon/PWA** | Generated favicon, manifest.json | Icon, theme color, app name |

##### 2.1.2 Vertical Templates

| Template | Additional Sections | Target User |
|---|---|---|
| **Marketing Site** | Features grid, testimonials, CTA sections, pricing teaser | Indie founders, SaaS |
| **Blog** | Post listing, post detail, categories/tags, RSS feed | Bloggers, content creators |
| **SaaS Landing** | Pricing table (static), feature comparison, FAQ accordion | SaaS founders |
| **Portfolio / Brochure** | Project gallery, lightbox, filterable grid | Artists, designers, photographers |
| **Small Business** | Services list, team section, hours/location, reviews embed | Tradespeople, local business |
| **Simple Store** | Product cards, cart (localStorage), Stripe checkout link | Artisans, small retailers |
| **Bookings** | Calendar embed (Calendly/Cal.com), service menu | Salons, consultants, coaches |
| **Form-to-Email** | Multi-step form builder, confirmation page | Lead gen, surveys |

##### 2.1.3 Image Strategy (MVP)

For MVP, **no user image upload**. All imagery comes from:

| Source | Usage | Integration |
|---|---|---|
| **AI-generated SVG** | Logos, icons, illustrations, decorative elements | Builder AI generates inline; zero external dependency |
| **Unsplash API** (free) | Photos for heroes, backgrounds, team sections | 50 req/hr free; Builder AI selects contextually |
| **Placeholder SVGs** | Geometric patterns, abstract backgrounds | Generated inline by Builder AI |
| **Lucide / Heroicons** (bundled) | UI icons within generated sites | CDN or bundled; MIT licensed; zero cost |

**Logo strategy:**

| Scenario | Approach |
|---|---|
| User describes their brand | AI generates an SVG text-logo using business name + appropriate font + brand colors |
| User provides no brand info | AI creates a minimal SVG monogram (first letter) with template colors |

#### Feature 2.2: First-Message Classification & Routing

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-2.2.1** | As the Chat AI, I classify the user's first message to determine template-path vs. scratch-path | LLM classifies intent against template catalog; returns `{path: "template", template_id: "..."}` or `{path: "scratch"}` with confidence score |
| **US-2.2.2** | As the Chat AI, when template-path is selected, I immediately deploy the chosen template with quick customizations from the user's first message | Within ≤30 seconds: Title, Logo placeholder, Slogan, and Style Colors are applied from parsed first message (or sensible defaults if none given); preview renders in iframe |
| **US-2.2.3** | As the Chat AI, when scratch-path is selected, I begin requirements gathering via chat | AI asks targeted questions; begins building backlog before any code generation |
| **US-2.2.4** | As the Chat AI, if a template-path conversation takes a turn that invalidates the template, I suggest the user start a new conversation with a better prompt | AI provides a specific example prompt; does NOT attempt to code decision trees past the initial fork |

```
                    ┌────────────────────┐
                    │   User sends       │
                    │   first message    │
                    └────────┬───────────┘
                             │
                    ┌────────▼───────────┐
                    │   LLM Classifier   │
                    │   "Does this fit   │
                    │    a template?"    │
                    │   (if < 0.7        │
                    │   confidence, ask  │
                    │   one clarifying   │
                    │   question)        │
                    └────────┬───────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
         ┌───────▼───────┐    ┌────────▼────────┐
         │ TEMPLATE PATH │    │  SCRATCH PATH   │
         │               │    │                 │
         │ 1. Select     │    │ 1. Gather reqs  │
         │    template   │    │    via chat     │
         │ 2. Quick-     │    │ 2. Build        │
         │    customize  │    │    backlog      │
         │ 3. Render     │    │ 3. Generate     │
         │    in iframe  │    │    first pass   │
         │    (<30s)     │    │ 4. Render in    │
         │ 4. Build      │    │    iframe       │
         │    backlog    │    │                 │
         │    in bg      │    │                 │
         └───────────────┘    └─────────────────┘
```

---

### Epic 3: Preview Engine (Blue/Green Iframe)

#### Feature 3.1: Blue/Green Swap Strategy

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-3.1.1** | As a user, I always see a working prototype in the preview iframe that is never interrupted during builds | Two sandboxed iframes exist (Blue = visible, Green = hidden); Green receives new build; on success, opacity/z-index swap makes Green visible and Blue hidden; atomic CSS transition |
| **US-3.1.2** | As a user, every visitor to the studio URL sees the current visible preview | The visible preview (Blue slot) is accessible to any visitor; no authentication required for viewing |
| **US-3.1.3** | As a user, the preview never "expires" — it remains visible until I click "New Conversation" | No timeout; preview persists in DOM; New Conversation click triggers ChlorastroliteLoader replacement |
| **US-3.1.4** | As a user, I can interact with the preview (click links, fill forms, etc.) | Iframe is sandboxed with `allow-scripts allow-forms allow-same-origin`; `postMessage` bridge for studio ↔ preview communication |

##### Blue/Green Swap Sequence

```
Time ──────────────────────────────────────────────────►

   BLUE (visible)          GREEN (hidden, building)
   ┌──────────────┐        ┌──────────────┐
   │  Version N   │        │  Builder AI  │
   │  (user sees) │        │  writes V(N+1) │
   │              │        │  into Green  │
   └──────────────┘        └──────┬───────┘
                                  │ Build complete
                                  │ Validation pass
                                  ▼
   BLUE (now hidden)       GREEN (now visible)
   ┌──────────────┐        ┌──────────────┐
   │  Becomes     │        │  Version N+1 │
   │  next build  │        │  (user sees) │
   │  target      │        │              │
   └──────────────┘        └──────────────┘
```

#### Feature 3.2: ChlorastroliteLoader Animation

The `ChlorastroliteLoader` React component is the canonical loader animation for the preview panel.

| Property | Type | Default | Description |
|---|---|---|---|
| `variant` | `"gem" \| "eye"` | `"gem"` | Visual variant. `gem` is the standard loader. `eye` is a hidden easter egg. |
| `label` | `string \| undefined` | `"Forging the first preview — we'll unveil the prototype the instant the gem crystallizes."` | Customizable status message beneath the animation |

**Loader is shown when:**
- Studio first loads with no active session
- "New Conversation" resets the studio
- Deploy or reset clears the preview
- Session exists but no build has completed yet

**Dynamic label progression:**

| Build Stage | Label Text |
|---|---|
| Fresh start / conversation reset | *"Forging the first preview — we'll unveil the prototype the instant the gem crystallizes."* |
| Template selected, customizing | *"Shaping your site from the template — colors and content are being set…"* |
| Code generation in progress | *"The gem is forming — code is being written…"* |
| Validation / pre-swap check | *"Almost there — polishing the final facets…"* |
| Swap imminent (< 2 seconds) | *"Crystallized! Unveiling now…"* |

**Loader state machine:**

```
┌───────────────┐     User clicks          ┌────────────────────────┐
│  PREVIEW      │     "New Conversation"    │  LOADER                │
│  (Blue/Green  │ ─────────────────────►    │  (ChlorastroliteLoader │
│   iframe      │                           │   variant="gem")       │
│   visible)    │     First build ready     │                        │
│               │ ◄──────────────────────   │  label progresses      │
└───────────────┘                           │  through stages        │
      ▲                                     └────────────────────────┘
      │         Preview swap occurs                    │
      └────────────────────────────────────────────────┘
```

**Easter egg:** The `eye` variant is activated by a secret interaction (e.g., clicking the loader gem 7 times rapidly, or typing `margaret` in the chat input while the loader is visible). Once activated, the loader switches to the eye animation for the remainder of that session.

**Component source code:**

```tsx
import type React from "react";

type ChlorastroliteVariant = "gem" | "eye";

export const ChlorastroliteLoader: React.FC<{
  label?: string;
  variant?: ChlorastroliteVariant;
}> = ({ label, variant = "gem" }) => {
  const isEye = variant === "eye";
  return (
    <div className="pointer-events-none flex flex-col items-center justify-center gap-4 text-center text-text-muted">
      <div className="relative h-60 w-60">
        {isEye ? (
          <svg
            viewBox="-120 -80 240 160"
            className="h-full w-full"
            role="img"
            aria-label="Margaret easter egg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="eyeShell" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <radialGradient id="irisGlow" cx="0.3" cy="0.3" r="0.8">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="45%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#0f766e" />
              </radialGradient>
            </defs>
            <g>
              <path
                d="M-100 0 Q0 -60 100 0 Q0 60 -100 0Z"
                fill="url(#eyeShell)"
                stroke="#2dd4bf"
                strokeWidth="2"
                opacity="0.85"
              />
              <ellipse cx="0" cy="0" rx="70" ry="38" fill="#0f172a" opacity="0.75" />
              <circle cx="0" cy="0" r="28" fill="url(#irisGlow)">
                <animate attributeName="r" values="26;30;26" dur="4.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="0" r="12" fill="#020617">
                <animate attributeName="r" values="10;14;10" dur="4.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="8" cy="-8" r="6" fill="#e2e8f0" opacity="0.85" />
              <circle cx="-10" cy="10" r="4" fill="#94a3b8" opacity="0.7" />
            </g>
          </svg>
        ) : (
          <svg
            viewBox="-100 -100 200 200"
            className="h-full w-full"
            role="img"
            aria-label="Forging first live preview"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="outerAura" cx="0" cy="0" r="1">
                <stop offset="0%" stopColor="#5eead4" stopOpacity="0.65" />
                <stop offset="55%" stopColor="#22d3ee" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="gemFacet" x1="-0.6" y1="-0.8" x2="0.8" y2="0.9">
                <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
                <stop offset="30%" stopColor="#86efac" stopOpacity="0.85" />
                <stop offset="70%" stopColor="#22d3ee" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.9" />
              </linearGradient>
              <radialGradient id="gemCore" cx="0" cy="0" r="1">
                <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.95" />
                <stop offset="40%" stopColor="#5eead4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0b3d3a" stopOpacity="0.9" />
              </radialGradient>
              <linearGradient id="gemHighlight" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.75)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              <mask id="highlightSweep">
                <rect x="-120" y="-120" width="240" height="240" fill="black" />
                <rect x="-80" y="-80" width="160" height="160" fill="url(#gemHighlight)">
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    from="-80 0"
                    to="80 0"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </rect>
              </mask>
              <clipPath id="gemClip">
                <circle cx="0" cy="0" r="46" />
              </clipPath>
            </defs>
            <g>
              <circle cx="0" cy="0" r="72" fill="url(#outerAura)" opacity="0.45">
                <animate attributeName="opacity" values="0.25;0.6;0.25" dur="4.8s" repeatCount="indefinite" />
                <animateTransform
                  attributeName="transform"
                  type="scale"
                  values="1;1.08;1"
                  dur="4.8s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
            <g strokeLinecap="round" strokeWidth="4" fill="none">
              <g stroke="#4bf4f0" opacity="0.4">
                <circle r="52" strokeDasharray="48 180">
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite" />
                </circle>
              </g>
              <g stroke="#2dd4bf" opacity="0.6">
                <circle r="44" strokeDasharray="32 140">
                  <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="6.5s" repeatCount="indefinite" />
                </circle>
              </g>
              <g stroke="#0ea5e9" opacity="0.5">
                <circle r="36" strokeDasharray="24 110">
                  <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="4.5s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
            <g clipPath="url(#gemClip)">
              <circle cx="0" cy="0" r="46" fill="url(#gemCore)" opacity="0.94" />
              <g opacity="0.5">
                <polygon points="-32,-6 -8,-40 20,-28 30,-2 6,26 -22,18" fill="url(#gemFacet)" />
                <polygon points="-10,10 14,-10 34,8 18,32 -8,34 -28,18" fill="#22d3ee" opacity="0.45" />
                <polygon points="-26,-20 -6,-34 18,-26 8,-6 -14,-2 -30,-10" fill="#0f766e" opacity="0.35" />
              </g>
              <g opacity="0.22">
                <circle cx="-14" cy="-18" r="14" fill="white" />
                <circle cx="18" cy="-12" r="10" fill="#c4f1f9" />
                <circle cx="-2" cy="16" r="18" fill="#93e5d9" />
              </g>
              <g mask="url(#highlightSweep)">
                <rect x="-60" y="-60" width="120" height="120" fill="white" opacity="0.35" />
              </g>
            </g>
            <g>
              <circle cx="-20" cy="-30" r="6" fill="#e0f2fe" opacity="0.85">
                <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="24" cy="-16" r="4" fill="#bae6fd" opacity="0.6">
                <animate attributeName="opacity" values="0.1;0.7;0.1" dur="2.8s" repeatCount="indefinite" />
              </circle>
            </g>
          </svg>
        )}
      </div>
      <div className="max-w-xs text-sm text-text-muted">
        {label ?? "Forging the first preview — we'll unveil the prototype the instant the gem crystallizes."}
      </div>
    </div>
  );
};
```

---

### Epic 4: Backlog Management

#### Feature 4.1: Backlog Panel UI

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-4.1.1** | As a user, I see an **On Deck** work item that is visually locked and untouchable | On Deck card has a lock icon; no drag handle; no click-to-focus; distinct background color; tooltip: "This item is queued for the builder and cannot be changed" |
| **US-4.1.2** | As a user, I see an ordered **Backlog** list below On Deck | Numbered list of work item cards; each card shows: title, brief description, effort indicator (S/M/L) |
| **US-4.1.3** | As a user, I can drag and drop backlog items to indicate my priority preference | Drag/drop reorders visually; change is submitted to Chat AI (PO) for approval; if approved, order persists; if denied, order reverts with animation + chat explanation |
| **US-4.1.4** | As a user, I can click a backlog item to "focus" it for discussion | Focused item elevates (shadow + slight scale); highlight border; chat context switches to that item; user can ask questions or request changes via chat |
| **US-4.1.5** | As a user, I can click Pause to stop the builder from picking up the On Deck item | Pause button toggles to Resume; On Deck card shows "Paused" badge; builder will not start new work until resumed |
| **US-4.1.6** | As the Chat AI (PO), I take the user's drag/drop re-ordering into consideration but may deny it if it creates dependency or quality problems | PO grants if no issue; denies with explanation if: dependency violation, design anti-pattern, or prerequisites missing; revert is animated |

**PO arbitration logic (single code path — no override mode):**

```typescript
async function handleReorder(fromIndex: number, toIndex: number): Promise<void> {
  const decision = await chatAI.evaluateReorder(fromIndex, toIndex, store.backlog);
  if (decision.approved) {
    store.reorderBacklog(fromIndex, toIndex);
  } else {
    store.revertReorder();
    store.addAiMessage(decision.explanation);
  }
}
```

#### Feature 4.2: Backlog Generation & Refinement

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-4.2.1** | As the Chat AI, I auto-generate a prioritized backlog after the first message is processed | Backlog items are structured: `{id, title, description, effort, status, dependencies[], rationale}` |
| **US-4.2.2** | As the Chat AI, I auto-split large features into smaller, independently deliverable work items | No work item should require more than one builder iteration to complete |
| **US-4.2.3** | As the Chat AI, I continuously refine the backlog based on user feedback via chat | User cannot directly edit requirement text; all changes go through chat; AI updates backlog items accordingly |
| **US-4.2.4** | As the builder, I automatically pick up the On Deck item when ready and begin work | Builder polls/subscribes for On Deck availability; begins code generation immediately; updates status to "In Progress" |
| **US-4.2.5** | As the Chat AI, I proactively add SEO optimization items to the backlog | SEO items auto-prioritized as Medium; placed in lower half of backlog; completed before deployment when possible |

**Automatic SEO backlog items:**

| Trigger | Auto-Generated Backlog Item |
|---|---|
| No `<meta description>` | *"Add meta descriptions to all pages for search engine visibility"* |
| Images lack `alt` attributes | *"Add descriptive alt text to all images for accessibility and SEO"* |
| No Open Graph tags | *"Add Open Graph meta tags for rich social media previews"* |
| No structured data | *"Add JSON-LD structured data (LocalBusiness/Organization/Article as appropriate)"* |
| No sitemap | *"Generate sitemap.xml for search engine crawling"* |
| No robots.txt | *"Add robots.txt with appropriate directives"* |
| Pages load slowly (estimated) | *"Optimize images and defer non-critical CSS/JS for faster load times"* |
| No canonical URLs | *"Add canonical URL tags to prevent duplicate content issues"* |
| Missing heading hierarchy | *"Fix heading hierarchy (h1 → h2 → h3) for SEO structure"* |

---

### Epic 5: AI Guardrails & Design Expertise

**All guardrails are always enforced for MVP. There is no user-facing override mechanism.**

If a user insists on a practice the AI has flagged as problematic, the AI explains the impact clearly up to two times, then complies with a brief inline caveat: *"Built as requested — here's what I'd watch out for: [one-liner]."* The AI is collaborative, not authoritarian.

#### Feature 5.1: Constructive "No" — Best Practices Enforcement

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-5.1.1** | As the Chat AI, I push back constructively when the user requests a layout, flow, or pattern that violates modern web best practices | AI explains *why* the request is problematic; suggests a better alternative; tone is helpful, not condescending; complies after two pushbacks with inline caveat |
| **US-5.1.2** | As the Chat AI, I always prefer zero-cost solutions before suggesting anything that incurs cost | Decision tree: free → low-cost → paid, with explicit justification if escalating |
| **US-5.1.3** | As the Chat AI, I proactively suggest design improvements the user wouldn't know to ask for | Examples: responsive image handling, accessible color contrast, semantic HTML, lazy loading, proper heading hierarchy |

#### 5.1.4 Guardrail Decision Matrix

| User Request | Guardrail Response |
|---|---|
| "Add a database for my contact form" | Suggest form-to-email (Formspree/Netlify Forms free tier) or Cloudflare Workers + KV |
| "I need user login" | Suggest Cloudflare Access (free for <50 users) or static auth pattern before paid auth providers |
| "Put all the text in Comic Sans" | Constructively suggest modern alternatives; explain readability; offer 2–3 curated options |
| "Make the whole page one giant image" | Explain performance/SEO/accessibility impact; suggest hero image + structured content |
| "I need a backend API" | Suggest Cloudflare Workers (100K req/day free) or Netlify Functions (125K req/month free) |
| "I need a database" | Suggest Cloudflare D1 (5GB free), Workers KV, or localStorage/LowDB patterns first |

---

### Epic 6: Deployment Engine

#### Feature 6.1: One-Click Deployment

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-6.1.1** | As a user, I can deploy my finished site with a single click | Deploy button triggers automated pipeline; user sees progress in chat; final message includes live URL |
| **US-6.1.2** | As the system, I favor zero-cost hosting in this priority order | **Priority stack:** 1) GitHub Pages 2) Cloudflare Pages 3) Netlify 4) Vercel (hobby/non-commercial only) |
| **US-6.1.3** | As a user, I receive a user-site-branded documentation packet after deployment | Markdown + PDF packet generated automatically; branded with user's site logo, colors, and name; includes all sections per §6.3 |
| **US-6.1.4** | As the system, I only offer deploy targets for which the user has a validated token | Deploy button disabled if no tokens configured; tooltip: "Configure a deploy token in Settings" |

#### Feature 6.2: Token-Based Deploy Authentication

Users paste deployment tokens manually. The studio provides step-by-step acquisition guides for each host.

##### 6.2.1 Token Configuration UI

```
┌──────────────────────────────────────────────────┐
│  ⚙ Settings > Deploy Tokens                      │
├──────────────────────────────────────────────────┤
│                                                  │
│  GitHub Personal Access Token                    │
│  ┌────────────────────────────────────────────┐  │
│  │ ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx           │  │
│  └────────────────────────────────────────────┘  │
│  [📋 How to get this token]  ← expandable guide  │
│  ✅ Token validated                               │
│                                                  │
│  Netlify Personal Access Token                   │
│  ┌────────────────────────────────────────────┐  │
│  │ (not configured)                           │  │
│  └────────────────────────────────────────────┘  │
│  [📋 How to get this token]                      │
│                                                  │
│  Cloudflare API Token                            │
│  ┌────────────────────────────────────────────┐  │
│  │ (not configured)                           │  │
│  └────────────────────────────────────────────┘  │
│  [📋 How to get this token]                      │
│                                                  │
│  ℹ Only the hosts with valid tokens will be      │
│    available as deploy targets.                   │
└──────────────────────────────────────────────────┘
```

##### 6.2.2 GitHub Personal Access Token Guide

```markdown
## How to get your GitHub Personal Access Token

### What you need
A **fine-grained personal access token** with permission to create
repositories and push code.

### Steps
1. **Go to GitHub Settings**
   → Navigate to https://github.com/settings/tokens?type=beta
   → (You must be logged into GitHub)

2. **Click "Generate new token"**

3. **Configure the token:**
   - **Token name:** `prontoproto-studio`
   - **Expiration:** 90 days (or "No expiration" — your choice)
   - **Repository access:** "All repositories"
   - **Permissions → Repository permissions:**
     - `Contents`: Read and write
     - `Pages`: Read and write
     - `Metadata`: Read-only (auto-selected)
     - `Administration`: Read and write (needed to create repos)

4. **Click "Generate token"**

5. **Copy the token immediately** — you won't see it again!
   It starts with `github_pat_` or `ghp_`

6. **Paste it into the field above**

### Security note
This token is stored encrypted in your browser only. It is never sent
to prontoproto.studio servers — it goes directly to GitHub's API.
```

##### 6.2.3 Netlify Personal Access Token Guide

```markdown
## How to get your Netlify Personal Access Token

### Steps
1. **Go to Netlify User Settings**
   → Navigate to https://app.netlify.com/user/applications#personal-access-tokens

2. **Under "Personal access tokens," click "New access token"**

3. **Give it a description:** `prontoproto-studio`

4. **Click "Generate token"**

5. **Copy the token immediately** — you won't see it again!

6. **Paste it into the field above**

### What this token can do
Full access to your Netlify account. The studio uses it only to:
- Create new sites
- Deploy files to those sites
- Check deploy status

### Security note
Stored encrypted in your browser only. Never transmitted to our servers.
```

##### 6.2.4 Cloudflare API Token Guide

```markdown
## How to get your Cloudflare API Token

### Steps
1. **Go to Cloudflare API Tokens**
   → Navigate to https://dash.cloudflare.com/profile/api-tokens

2. **Click "Create Token"**

3. **Click "Get started" next to "Create Custom Token"**

4. **Configure the token:**
   - **Token name:** `prontoproto-studio`
   - **Permissions:**
     - `Account` → `Cloudflare Pages` → `Edit`
     - `Account` → `Workers Scripts` → `Edit` (if using Workers)
     - `Zone` → `DNS` → `Edit` (if configuring custom domains)
   - **Account Resources:** Include → Your account
   - **Zone Resources:** Include → All zones (or specific zone)

5. **Click "Continue to summary" → "Create Token"**

6. **Copy the token immediately!**

7. **Paste it into the field above**

### You'll also need your Account ID
   → Go to any zone/domain dashboard in Cloudflare
   → Find "Account ID" in the right sidebar
   → Paste it in the "Cloudflare Account ID" field below the token

### Security note
Stored encrypted in your browser only. Never transmitted to our servers.
```

##### 6.2.5 Token Validation

```typescript
interface TokenValidation {
  host: 'github' | 'netlify' | 'cloudflare';
  status: 'valid' | 'invalid' | 'expired' | 'insufficient_permissions' | 'unchecked';
  scopes?: string[];
  username?: string;
  checkedAt?: number;
}

const validators = {
  github: async (token: string) => {
    // GET https://api.github.com/user with Bearer token
    // Check X-OAuth-Scopes header for required permissions
  },
  netlify: async (token: string) => {
    // GET https://api.netlify.com/api/v1/user with Bearer token
  },
  cloudflare: async (token: string, accountId: string) => {
    // GET https://api.cloudflare.com/client/v4/user/tokens/verify
  },
};
```

##### 6.2.6 Deploy Target Availability

| Configured Tokens | Available Deploy Targets | Auto-Selected |
|---|---|---|
| GitHub only | GitHub Pages | GitHub Pages |
| GitHub + Cloudflare | GitHub Pages, Cloudflare Pages | Based on site features (zero-cost priority) |
| All three | All three | Zero-cost priority stack applies |
| None | Deploy button disabled | — |

#### Feature 6.3: Automated Deployment Pipeline

```
┌────────────────┐
│ User clicks    │
│ "Deploy"       │
└───────┬────────┘
        │
┌───────▼────────┐     ┌─────────────────────┐
│ Pre-deploy     │────►│ Dependency scan      │
│ validation     │     │ • No node_modules    │
│                │     │ • Static assets only │
│                │     │ • Lighthouse audit   │
│                │     │ • Link checker       │
└───────┬────────┘     └─────────────────────┘
        │
┌───────▼────────┐
│ Target host    │
│ selection      │
│ (zero-cost     │
│  priority)     │
└───────┬────────┘
        │
┌───────▼────────────────────────────────────┐
│ Host-specific deployment:                  │
│ • GitHub: Create repo → push → enable      │
│   Pages via API                            │
│ • Cloudflare: Deploy via Wrangler/API      │
│ • Netlify: Deploy via Netlify API          │
└───────┬────────────────────────────────────┘
        │
┌───────▼────────┐
│ Post-deploy    │
│ • Verify URL   │
│ • Generate     │
│   doc packet   │
│ • Report in    │
│   chat         │
└────────────────┘
```

##### Zero-Cost Host Comparison (for decision engine)

| Host | Free Tier | Bandwidth | Builds | Commercial Use | Serverless | Best For |
|---|---|---|---|---|---|---|
| **GitHub Pages** | ✅ Always free | 100 GB/mo | 10/hr | ✅ Yes | ❌ No | Pure static sites |
| **Cloudflare Pages** | ✅ Always free | **Unlimited** | 500/mo | ✅ Yes | ✅ Workers (100K req/day) | Sites needing edge compute |
| **Netlify** | ✅ Always free | 100 GB/mo | 300 min/mo | ✅ Yes | ✅ Functions (125K req/mo) | Sites with forms/functions |
| **Vercel** | ✅ Hobby free | 100 GB/mo | 6K min/mo | ❌ Non-commercial | ✅ Functions (100K req/day) | Next.js (non-commercial) |

---

### Epic 7: Documentation Packet Generation

#### Feature 7.1: User-Site-Branded Documentation

The documentation packet is branded with the **user's site identity** — not prontoproto.studio branding.

| Branding Element | Source |
|---|---|
| **Logo** | User's generated SVG logo from the site |
| **Site name** | Title from VFS metadata |
| **Primary color** | `--color-primary` from the generated site's CSS custom properties |
| **Accent color** | `--color-accent` from the generated site's CSS custom properties |
| **Font** | Same font family used in the generated site |
| **Footer attribution** | `"Built with prontoproto.studio"` — small, tasteful |

#### 7.1.2 Documentation Packet Structure

```
📁 {site-name}-docs/
├── README.md                    ← Master document (styled with site branding)
├── 01-site-overview.md          ← Architecture, tech used, design decisions
├── 02-pages-and-components.md   ← Per-page walkthrough with descriptions
├── 03-dependencies.md           ← Every external dep with links & free-tier limits
├── 04-custom-domain-setup.md    ← Step-by-step DNS + domain configuration
├── 05-service-configuration.md  ← Per-service guides (CF Workers, forms, etc.)
├── 06-maintenance-guide.md      ← How to update, where files are, rebuild steps
├── 07-cost-summary.md           ← Current cost ($0), what triggers costs
├── assets/
│   ├── logo.svg                 ← User's generated logo
│   └── screenshot-*.png         ← Auto-captured page screenshots
└── prontoproto-attribution.md   ← "Built with prontoproto.studio" credits
```

| ID | Story | Acceptance Criteria |
|---|---|---|
| **US-7.1.1** | As a user, I receive a comprehensive documentation packet after deployment | Packet auto-generated; includes all sections above; downloadable as Markdown bundle + rendered PDF; branded with user's site identity |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Requirement | Target | Notes |
|---|---|---|
| Time to first preview (template path) | ≤ 30 seconds | Template deploy + quick customization |
| Time to first preview (scratch path) | ≤ 120 seconds | Requires requirements gathering first |
| Chat response latency | ≤ 3 seconds (p95) | Depends on LLM provider; accept cold starts for MVP |
| Blue/green swap time | ≤ 500ms | CSS transition; no full page reload |
| Deploy pipeline (click to live) | ≤ 60 seconds | GitHub Pages build + propagation |

### 4.2 Scalability

| Requirement | Target |
|---|---|
| Concurrent users | 1 (single-user; no concurrency) |
| Active sessions per day | <10 (typically 1–2) |
| Session model | Single active session; no multi-session switching for MVP |
| Design for scale-out later | Stateless architecture; no shared mutable state between sessions |

### 4.3 Security

| Requirement | Implementation |
|---|---|
| API key storage | Browser `localStorage` with AES-256 encryption; keys never transit studio servers |
| Deploy token storage | Same encryption as API keys; stored per host |
| Generated code safety | No `eval()` in generated code; CSP headers in preview iframe; dependency allowlist |
| Deployment safety | Pre-deploy Lighthouse audit; broken link check; known vulnerability scan against CDN dependencies |
| Privacy | No third-party trackers in studio; no user data collection beyond legal telemetry |
| Auth for generated sites | Prefer Cloudflare Access (free <50 users) before implementing custom auth |

### 4.4 Cost Guardrails (always enforced, no override)

| Principle | Enforcement |
|---|---|
| Studio hosting | Must run on free tier (Cloudflare Pages/Workers or equivalent) |
| Generated site hosting | Always-free-first priority stack |
| LLM costs | User-provided API keys; running total displayed; no studio-incurred LLM cost |
| Storage/compute for generated sites | localStorage/LowDB → Cloudflare KV/D1 (free) → paid DB only if user explicitly requests |

### 4.5 Telemetry & Observability

| Metric Category | What to Capture | Purpose |
|---|---|---|
| **Session metrics** | Session duration, messages sent, backlog items created, builds triggered, deploys | Usage patterns |
| **Build metrics** | Time to first preview, build duration, swap count, error rate | Performance optimization |
| **LLM metrics** | Tokens in/out per model, cost per call, latency, error rate | Cost tracking; model comparison |
| **Deploy metrics** | Deploy duration, target host, success/failure, site size | Reliability |
| **Template metrics** | Which templates selected, template-vs-scratch ratio, invalidation rate | Template library improvement |

> **Storage:** Append-only JSON log per session; stored locally in IndexedDB. No PII. Legal compliance only.

---

## 5. Technical Architecture

### 5.1 Recommended Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Studio Frontend** | React (TypeScript) + Vite | Fast HMR; mature ecosystem; existing expertise |
| **Studio Hosting** | Cloudflare Pages (free) | Unlimited bandwidth; 500 builds/mo; Workers integration |
| **State Management** | Zustand or Jotai | Lightweight; no boilerplate; perfect for single-user app |
| **Chat UI** | Custom React components (iMessage-style) | Full control over UX; no heavy dependency |
| **Preview Iframes** | Sandboxed `<iframe>` with `srcdoc` | Instant rendering; no server needed; `postMessage` bridge |
| **LLM Gateway** | Lightweight TypeScript abstraction layer | Unified interface to OpenAI/Anthropic/Google APIs; runs client-side with user keys |
| **Builder Engine** | AI code generation → in-memory VFS → `srcdoc` injection | No server needed for preview; files assembled client-side |
| **Template Library** | Static JSON configs + HTML/CSS/JS bundles | Loaded at startup; no server dependency |
| **Deploy Engine** | GitHub REST API (Octokit) / Netlify API / Cloudflare API | Programmatic deployment from browser via user's tokens |
| **Documentation Gen** | Markdown templates + AI narrative | Generated client-side; downloadable |
| **Telemetry** | Custom append-only JSON logger to IndexedDB | No external dependency; session-local |

### 5.2 Client-Side Architecture (Zero Backend)

The studio runs **entirely client-side** with no proprietary backend server. This eliminates hosting cost and complexity.

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                   │
│                                                       │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ React App  │  │ LLM       │  │ Deploy Client  │  │
│  │ (UI +      │  │ Gateway   │  │ (Octokit /     │  │
│  │  State)    │  │ (direct   │  │  Netlify SDK / │  │
│  │            │  │  to APIs) │  │  CF Wrangler)  │  │
│  └────────────┘  └───────────┘  └────────────────┘  │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Template   │  │ Builder   │  │ Preview Engine │  │
│  │ Library    │  │ Engine    │  │ (Blue/Green    │  │
│  │ (bundled)  │  │ (code gen │  │  Iframes +     │  │
│  │            │  │  + patch) │  │  Loader)       │  │
│  └────────────┘  └───────────┘  └────────────────┘  │
│  ┌─────────────────────────────────────────────────┐ │
│  │ localStorage / IndexedDB                        │ │
│  │ • Encrypted API keys  • Encrypted deploy tokens │ │
│  │ • Conversation history • Generated files (VFS)  │ │
│  │ • Telemetry logs      • Backlog state           │ │
│  │ • LLM config          • Session state           │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
   OpenAI/Anthropic  GitHub API   Cloudflare/
   /Google APIs      (deploy)     Netlify APIs
```

### 5.3 Virtual File System (VFS)

```typescript
interface VirtualFile {
  path: string;          // e.g., "index.html", "css/style.css"
  content: string;       // File contents
  hash: string;          // Content hash for diffing
  lastModified: number;  // Timestamp
}

interface VirtualFileSystem {
  files: Map<string, VirtualFile>;
  version: number;       // Incremented on each build
  templateId?: string;   // If template-path
  metadata: {
    title: string;
    description: string;
    colors: ColorPalette;
    fonts: FontSelection;
  };
}
```

### 5.4 Blue/Green Preview Implementation

```typescript
class PreviewEngine {
  private blueIframe: HTMLIFrameElement;
  private greenIframe: HTMLIFrameElement;
  private activeSlot: 'blue' | 'green' = 'blue';

  async deployToGreen(vfs: VirtualFileSystem): Promise<void> {
    const html = this.assembleHTML(vfs);
    const inactiveFrame = this.activeSlot === 'blue'
      ? this.greenIframe : this.blueIframe;

    inactiveFrame.srcdoc = html;
    await this.waitForLoad(inactiveFrame);

    const valid = await this.validate(inactiveFrame);
    if (!valid) return; // Report error to chat, don't swap

    this.swap();
  }

  private swap(): void {
    const outgoing = this.activeSlot === 'blue'
      ? this.blueIframe : this.greenIframe;
    const incoming = this.activeSlot === 'blue'
      ? this.greenIframe : this.blueIframe;

    incoming.style.opacity = '1';
    incoming.style.zIndex = '2';
    outgoing.style.opacity = '0';
    outgoing.style.zIndex = '1';

    this.activeSlot = this.activeSlot === 'blue' ? 'green' : 'blue';
  }
}
```

### 5.5 Build Validation Pipeline (single pipeline, one quality bar)

```typescript
async function validateBuild(vfs: VirtualFileSystem): Promise<boolean> {
  const errors = [
    ...await checkRuntimeErrors(vfs),
    ...await checkAccessibility(vfs),
    ...await checkSemanticHTML(vfs),
    ...await checkColorContrast(vfs),
    ...await checkPerformance(vfs),
  ];
  return errors.length === 0;
}
```

### 5.6 LLM Gateway Design

```typescript
interface LLMProvider {
  name: 'openai' | 'anthropic' | 'google';
  apiKey: string;
  models: string[];
}

interface LLMConfig {
  chatModel: { provider: LLMProvider; model: string };
  builderModel: { provider: LLMProvider; model: string };
}

interface LLMRequest {
  role: 'chat' | 'builder';
  systemPrompt: string;
  messages: Message[];
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
}

interface LLMResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  cost: number;
  latencyMs: number;
  model: string;
}

class LLMGateway {
  async send(request: LLMRequest): Promise<LLMResponse> {
    const config = this.getConfigForRole(request.role);
    const response = await this.callProvider(config, request);
    this.telemetry.logCost(response.cost);
    this.updateRunningTotal(response.cost);
    return response;
  }
}
```

---

## 6. Zero-Cost Solution Playbook

### 6.1 Common Needs → Zero-Cost Solutions

| Need | Zero-Cost Solution | How It Works | Limits |
|---|---|---|---|
| **Static hosting** | GitHub Pages / Cloudflare Pages | Git push → auto-deploy | 100GB BW (GH) / Unlimited (CF) |
| **Form submission** | Formspree (free) / Netlify Forms | `<form action="https://formspree.io/f/xxx">` | 50 subs/mo (Formspree) / 100 subs/mo (Netlify) |
| **Contact form email** | Cloudflare Workers + Mailgun free | Worker processes form, sends via Mailgun API | 100K req/day (CF) / 5K emails/mo (Mailgun) |
| **Simple data storage** | localStorage / LowDB (client-side) | JSON file in browser or static JSON file | ~5–10MB browser limit |
| **Key-value storage** | Cloudflare Workers KV (free tier) | Edge key-value store | 100K reads/day, 1K writes/day |
| **Relational data** | Cloudflare D1 (free tier) | SQLite at the edge | 5GB storage, 5M rows read/day |
| **Authentication** | Cloudflare Access (free <50 users) | Zero Trust access proxy | 50 users, OTP + social login |
| **Analytics** | Umami (self-hosted on CF Workers) or Plausible | Privacy-focused, no cookies | Varies |
| **Image hosting** | Cloudflare R2 (free tier) | S3-compatible object storage | 10GB storage, 10GB egress/mo |
| **Scheduled tasks** | Cloudflare Workers Cron Triggers | Free cron jobs at the edge | 100K req/day total |
| **Search** | Pagefind (static search) | Build-time index, client-side search | Any static site |
| **Comments** | Giscus (GitHub Discussions) | Embed GitHub Discussions | Requires GitHub account |
| **E-commerce checkout** | Stripe Payment Links | No backend needed; hosted checkout | 2.9% + $0.30/tx |
| **Maps** | Leaflet + OpenStreetMap | Free, no API key needed | No usage limits |
| **Booking/Scheduling** | Cal.com embed (free tier) | Embed booking widget | Unlimited bookings |
| **DNS** | Cloudflare DNS (free) | Fastest authoritative DNS | Unlimited queries |
| **SSL** | Auto (all free hosts provide it) | Let's Encrypt / Cloudflare | Always free |

### 6.2 Escalation Decision Tree

```
User needs feature X
        │
        ▼
┌─────────────────────┐
│ Can it be done with  │──── YES ──► Use that solution
│ pure HTML/CSS/JS?    │
└─────────┬───────────┘
          │ NO
          ▼
┌─────────────────────┐
│ Can Cloudflare       │──── YES ──► Use CF Workers/KV/D1/R2
│ Workers free tier    │              (100K req/day free)
│ handle it?           │
└─────────┬───────────┘
          │ NO
          ▼
┌─────────────────────┐
│ Can Netlify/Vercel   │──── YES ──► Use their serverless functions
│ free serverless      │              (125K/100K req/mo free)
│ handle it?           │
└─────────┬───────────┘
          │ NO
          ▼
┌─────────────────────┐
│ Explain cost impact  │
│ to user in chat;     │
│ get explicit consent │
│ before proceeding    │
└─────────────────────┘
```

---

## 7. Data Model

### 7.1 Core Entities

```typescript
// Studio State — single active session, no multi-session
interface StudioState {
  session: Session | null;
  conversation: ChatMessage[];
  backlog: WorkItem[];
  vfs: VirtualFileSystem | null;
  buildState: BuildState;
  deployments: Deployment[];
  telemetry: TelemetryEvent[];
  llmConfig: LLMConfig;
}

type BuildState = 'idle' | 'building' | 'swapping' | 'paused';

// Session
interface Session {
  id: string;
  createdAt: number;
  path: 'template' | 'scratch';
  templateId?: string;
  status: 'active' | 'deployed' | 'archived';
  llmConfig: LLMConfig;
  totalCost: number;
}

// Conversation Message
interface ChatMessage {
  id: string;
  sessionId: string;
  timestamp: number;
  sender: 'user' | 'chat_ai' | 'system';
  content: string;
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    backlogItemId?: string;
  };
}

// Backlog Work Item
interface WorkItem {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  effort: 'S' | 'M' | 'L';
  status: 'backlog' | 'on_deck' | 'in_progress' | 'done' | 'blocked';
  order: number;
  dependencies: string[];
  rationale: string;
  createdAt: number;
  completedAt?: number;
  buildVersion?: number;
}

// Deploy Record
interface Deployment {
  id: string;
  sessionId: string;
  host: 'github_pages' | 'cloudflare_pages' | 'netlify' | 'vercel';
  url: string;
  repoUrl?: string;
  deployedAt: number;
  siteSize: number;
  fileCount: number;
  status: 'deploying' | 'live' | 'failed';
}

// Token Validation
interface TokenValidation {
  host: 'github' | 'netlify' | 'cloudflare';
  status: 'valid' | 'invalid' | 'expired' | 'insufficient_permissions' | 'unchecked';
  scopes?: string[];
  username?: string;
  checkedAt?: number;
}

// Telemetry Event
interface TelemetryEvent {
  timestamp: number;
  sessionId: string;
  event: string;
  data: Record<string, unknown>;
}
```

### 7.2 Storage Strategy

| Data | Storage | Rationale |
|---|---|---|
| Session state | `localStorage` | Survives page refresh; single user |
| Conversation history | `IndexedDB` | Can grow large; structured queries |
| VFS (generated files) | `IndexedDB` | Binary-friendly; large capacity |
| API keys | `localStorage` (AES-256 encrypted) | Quick access |
| Deploy tokens | `localStorage` (AES-256 encrypted) | Quick access |
| Telemetry log | `IndexedDB` (append-only) | Structured; exportable |
| Backlog | `localStorage` | Small; frequent read |
| LLM config | `localStorage` | Persists across session resets |
| Model pricing table | Bundled JSON config file | Updatable without code change |

### 7.3 Session Reset Behavior

```typescript
function resetSession(store: StudioStore): void {
  // 1. Confirmation dialog (if session has content)
  // 2. Stop builder (if running)
  // 3. Clear session-specific data
  // 4. Preserve user preferences
  // 5. Preview shows ChlorastroliteLoader
  // 6. Chat shows welcome message
  store.set({
    session: null,
    conversation: [],
    backlog: [],
    vfs: null,
    buildState: 'idle',
    deployments: [],
    telemetry: [],
    // PRESERVED across resets:
    // - llmConfig (model selections)
    // - API keys (encrypted in localStorage)
    // - Deploy tokens (encrypted in localStorage)
  });
}
```

---

## 8. UI/UX Specification

### 8.1 Layout — Three-Panel Design

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                      │
│  [Logo]  prontoproto.studio    [⚙ Settings] [New Conversation]  │
│                                              [$0.42 session]     │
├──────────────────┬──────────────────────────┬───────────────────┤
│                  │                          │                   │
│   CHAT PANEL     │    PREVIEW PANEL         │  BACKLOG PANEL    │
│   (30% width)    │    (45% width)           │  (25% width)      │
│                  │                          │                   │
│  ┌────────────┐  │  ┌────────────────────┐  │ ┌──────────────┐ │
│  │  Messages  │  │  │                    │  │ │  ON DECK 🔒  │ │
│  │  (scroll)  │  │  │   ChlorastroliteL. │  │ │  [Item card] │ │
│  │            │  │  │       OR           │  │ ├──────────────┤ │
│  │  [User]    │  │  │   Sandboxed        │  │ │  BACKLOG     │ │
│  │  [AI]      │  │  │   Iframe Preview   │  │ │  1. [card]   │ │
│  │  [System]  │  │  │                    │  │ │  2. [card]   │ │
│  │            │  │  │                    │  │ │  3. [card]   │ │
│  │            │  │  │                    │  │ │  4. [card]   │ │
│  │            │  │  └────────────────────┘  │ │  ...         │ │
│  ├────────────┤  │                          │ │              │ │
│  │ [Input   ] │  │  [Responsive toggles]    │ │ [⏸ Pause]   │ │
│  │ [Send ▶  ] │  │  [Desktop|Tablet|Mobile] │ │              │ │
│  └────────────┘  │                          │ └──────────────┘ │
└──────────────────┴──────────────────────────┴───────────────────┘
```

### 8.2 Cost Ticker UI

```
┌────────────────────────────────────────────────┐
│  Header Bar                                     │
│  ...                            💰 $0.42        │ ← Always visible
│                                 ──────          │
│                                 hover ▼         │
│                          ┌──────────────────┐   │
│                          │ Session Cost     │   │
│                          │                  │   │
│                          │ Chat AI:  $0.18  │   │
│                          │  └ 14 calls      │   │
│                          │  └ gpt-4o-mini   │   │
│                          │                  │   │
│                          │ Builder: $0.24   │   │
│                          │  └ 6 calls       │   │
│                          │  └ claude-sonnet │   │
│                          │                  │   │
│                          │ Total tokens:    │   │
│                          │  In:  42,800     │   │
│                          │  Out: 18,200     │   │
│                          │                  │   │
│                          │ Pricing updated: │   │
│                          │ 2026-02-20       │   │
│                          └──────────────────┘   │
└────────────────────────────────────────────────┘
```

### 8.3 Chat Bubble Styling (iMessage-Inspired)

| Element | Specification |
|---|---|
| User bubble | Right-aligned, `#007AFF` (iOS blue), white text, `border-radius: 18px`, max-width 75% |
| AI bubble | Left-aligned, `#E9E9EB` (iOS gray), dark text, `border-radius: 18px`, max-width 75% |
| System message | Center-aligned, `#8E8E93` text, smaller font, no bubble, timestamp style |
| Typing indicator | Three animated dots in a gray bubble (left-aligned) |
| Timestamp | Below each message group, `#8E8E93`, small caps, relative time ("2 min ago") |
| Input field | Bottom-fixed, rounded corners, placeholder "Message prontoproto.studio…", send arrow button |

### 8.4 Backlog Card Design

| State | Visual Treatment |
|---|---|
| **On Deck** | Elevated card, `#FFD60A` (amber) left border, lock icon, no drag handle |
| **In Progress** | Pulsing blue dot indicator, progress bar |
| **Backlog (normal)** | White card, drag handle (⠿), numbered, shadow-sm |
| **Backlog (focused)** | Elevated (`scale(1.02)`), blue border, enhanced shadow, float effect |
| **Done** | Green checkmark, muted colors, collapsed by default |
| **Paused indicator** | On Deck card shows ⏸ badge, amber pulse |

### 8.5 Settings Modal Layout

```
┌──────────────────────────────────────────────┐
│  ⚙ Settings                            [✕]   │
├──────────────────────────────────────────────┤
│  [LLM Keys]  [Models]  [Deploy Tokens]       │
├──────────────────────────────────────────────┤
│                                              │
│  (Tab content renders here)                  │
│                                              │
└──────────────────────────────────────────────┘
```

Three tabs total. No "Advanced" tab for MVP.

### 8.6 Component Tree

```
<App>
├── <HeaderBar>
│   ├── <Logo />
│   ├── <CostTicker runningTotal={$} breakdown={...} />
│   │   └── <CostBreakdownTooltip />
│   ├── <SettingsButton />
│   └── <NewConversationButton />
│
├── <SettingsModal>
│   ├── <Tab label="LLM Keys">
│   │   ├── <ApiKeyInput provider="openai" />
│   │   ├── <ApiKeyInput provider="anthropic" />
│   │   └── <ApiKeyInput provider="google" />
│   ├── <Tab label="Models">
│   │   ├── <ModelSelector role="chat" />
│   │   └── <ModelSelector role="builder" />
│   └── <Tab label="Deploy Tokens">
│       ├── <TokenInput host="github" />
│       │   └── <ExpandableGuide content={githubGuide} />
│       ├── <TokenInput host="netlify" />
│       │   └── <ExpandableGuide content={netlifyGuide} />
│       └── <TokenInput host="cloudflare" />
│           └── <ExpandableGuide content={cloudflareGuide} />
│
├── <MainLayout>
│   ├── <ChatPanel>
│   │   ├── <MessageList>
│   │   │   ├── <UserBubble />
│   │   │   ├── <AiBubble />
│   │   │   ├── <SystemMessage />
│   │   │   └── <TypingIndicator />
│   │   └── <ChatInput>
│   │       ├── <TextArea placeholder="..." />
│   │       └── <SendButton />
│   │
│   ├── <PreviewPanel>
│   │   ├── <ChlorastroliteLoader variant="gem"|"eye" label={...} />
│   │   ├── <PreviewIframe slot="blue" />
│   │   ├── <PreviewIframe slot="green" />
│   │   ├── <ResponsiveToggles />
│   │   └── <DeployButton />
│   │
│   └── <BacklogPanel>
│       ├── <OnDeckCard locked />
│       ├── <BacklogList>
│       │   └── <BacklogCard />*
│       ├── <PauseResumeButton />
│       └── <BacklogEmpty />
│
└── <ConfirmDialog />
```

---

## 9. System Prompts

### 9.1 Chat AI System Prompt (Product Owner)

Static prompt — no conditional branching.

```markdown
You are the Product Owner for prontoproto.studio, an AI-powered website
creation studio. Your role:

## Identity
- You are a senior web product manager with deep expertise in modern web
  design, UX best practices, accessibility, and zero-cost deployment.
- You communicate in a friendly, clear, non-technical style.
- You make decisions about backlog priority, design quality, and
  technology choices.

## Core Principles
1. SPEED FIRST: Get a working preview in the iframe as fast as possible.
2. ZERO COST: Always prefer free solutions. Escalation order:
   pure client-side → Cloudflare free tier → Netlify/Vercel free →
   paid (only with explicit user consent).
3. BEST PRACTICES: Politely push back on requests that violate modern
   web standards. Explain why and offer better alternatives.
4. USER EMPOWERMENT: Users can influence but not directly edit
   requirements. You are the PO; they are the stakeholder.

## Guardrails (always enforced, no override)
- Never recommend paid hosting if free hosting works.
- Never allow anti-patterns: autoplaying video/audio, popup modals on
  load, dark patterns, inaccessible color contrast, semantic HTML
  violations.
- If a template-path conversation invalidates the template, suggest
  starting a new conversation with a specific example prompt.
- If a user insists on a practice you've flagged as problematic,
  explain the impact clearly up to two times, then comply with a
  brief inline note in the chat: "Built as requested — here's what
  I'd watch out for: [one-liner]." You are collaborative, not
  authoritarian.

## First Message Handling
- Classify: Does this fit a template? Return classification JSON.
  If confidence < 0.7, ask one clarifying question before deciding.
- If template: Immediately customize Title, Logo, Slogan, Colors from
  the message (use defaults for anything not specified). PRIORITY IS
  SPEED TO FIRST PREVIEW.
- If scratch: Begin focused requirements gathering.
- Simultaneously: Begin building the backlog.

## Backlog Management
- Auto-split large features into small, independently deliverable items.
- Enforce dependency ordering.
- When user drags to reorder: grant if safe, deny with explanation
  if not.
- Always keep one item On Deck and locked.
- Proactively add SEO optimization items to the backlog at medium
  priority (lower half of backlog; complete before deployment).
```

### 9.2 Builder AI System Prompt (Developer)

```markdown
You are the Developer for prontoproto.studio. You generate production-
quality HTML, CSS, and JavaScript for static web applications.

## Output Rules
1. Generate ONLY static HTML, CSS, and vanilla JavaScript.
2. All output must be self-contained and renderable in a sandboxed iframe.
3. Use modern CSS (Grid, Flexbox, custom properties, clamp(), etc.).
4. Mobile-first responsive design. Always.
5. Semantic HTML5. Always.
6. Accessible: ARIA labels, focus management, color contrast AA+.
7. Performance: Lazy load images, defer scripts, minimize DOM depth.
8. NO frameworks/libraries unless explicitly in the template config.

## Image Generation
- Generate SVG logos inline (text-based, monogram, or geometric).
- Use Unsplash API for contextual photography when available.
- All images MUST include descriptive alt text.
- Fallback: CSS gradients or inline SVG patterns if Unsplash unavailable.

## Code Quality
- Clean, readable, well-commented code.
- CSS custom properties for all theme values (colors, fonts, spacing).
- Consistent naming conventions (BEM for CSS classes).
- No inline styles except for dynamic values.

## File Structure
Always output a valid VFS patch:
{
  "files": [
    { "path": "index.html", "content": "..." },
    { "path": "css/style.css", "content": "..." },
    { "path": "js/main.js", "content": "..." }
  ],
  "deletedPaths": []
}

## Zero-Cost Mandate
- form-to-email: Use Formspree or Netlify Forms.
- Maps: Use Leaflet + OpenStreetMap (no Google Maps API key needed).
- Analytics: Include Umami or Plausible snippet if requested.
- Storage: localStorage first, Cloudflare KV if persistence needed.
- Auth: Cloudflare Access pattern if auth requested.
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Weeks 1–3)

| # | Task | Deliverable |
|---|---|---|
| 1.1 | Scaffold React + Vite + TypeScript project | Repo with CI/CD to Cloudflare Pages |
| 1.2 | Implement three-panel layout (chat, preview, backlog) | Responsive shell with placeholder content |
| 1.3 | Build iMessage-style chat component | Send/receive messages; typing indicator; auto-scroll |
| 1.4 | Build ChlorastroliteLoader component with gem/eye variants | Loader renders in preview panel; dynamic labels; easter egg |
| 1.5 | Build LLM Gateway (OpenAI first, then Anthropic/Google) | Unified API; cost tracking; model pricing JSON config |
| 1.6 | Build Virtual File System (VFS) with IndexedDB persistence | Create/read/update/delete files; versioning |
| 1.7 | Build Preview Engine (blue/green iframes) | `srcdoc` injection; atomic swap; `postMessage` bridge |
| 1.8 | Build Settings modal (LLM Keys tab, Models tab) | API key input with validation; model dropdowns; `localStorage` encryption |

### Phase 2: Template Library & Routing (Weeks 4–5)

| # | Task | Deliverable |
|---|---|---|
| 2.1 | Create common base components (Home, About, Contact, Nav, Footer) | HTML/CSS templates with customization points |
| 2.2 | Build 3 vertical templates (Marketing Site, Portfolio, Small Business) | Full template configs + assets |
| 2.3 | Implement first-message classifier | LLM-based routing: template vs. scratch; confidence threshold |
| 2.4 | Implement quick-customize pipeline | Parse first message → apply Title/Logo/Slogan/Colors → render ≤30s |
| 2.5 | Wire Chat AI system prompt + conversation management | Full PO personality; context window management |
| 2.6 | Implement SVG logo generation prompts | AI-generated text logos, monograms |
| 2.7 | Integrate Unsplash API for stock imagery | Contextual image selection; fallback to SVG patterns |

### Phase 3: Backlog & Builder Loop (Weeks 6–8)

| # | Task | Deliverable |
|---|---|---|
| 3.1 | Build Backlog Panel UI (On Deck, drag/drop, focus, pause) | Full interactive backlog with animations |
| 3.2 | Implement backlog auto-generation from chat | Chat AI → structured backlog items → panel |
| 3.3 | Implement proactive SEO backlog item generation | Auto-detect missing SEO elements → add medium-priority items |
| 3.4 | Implement Builder AI loop (On Deck → build → validate → swap) | Autonomous build cycle; VFS patching; blue/green swap |
| 3.5 | Implement PO re-order arbitration (single code path) | Drag → submit → approve/deny → animate |
| 3.6 | Implement focus-chat mode (click item → contextualized chat) | Chat context switches; item highlight/elevate |
| 3.7 | Add remaining vertical templates (Blog, SaaS, Store, Bookings, Form) | Full template library |

### Phase 4: Deployment & Documentation (Weeks 9–10)

| # | Task | Deliverable |
|---|---|---|
| 4.1 | Build Deploy Tokens settings tab with expandable acquisition guides | Token input, inline validation, step-by-step guides for GitHub/Netlify/CF |
| 4.2 | Implement GitHub Pages deployment (via GitHub API) | One-click; create repo; push; enable Pages |
| 4.3 | Implement Cloudflare Pages deployment | Cloudflare API integration |
| 4.4 | Implement Netlify deployment | Netlify API integration |
| 4.5 | Build pre-deploy validation pipeline | Lighthouse audit; link check; dependency scan |
| 4.6 | Implement deploy host selection logic | Auto-select based on zero-cost priority + available tokens + site features |
| 4.7 | Build documentation packet generator | User-site-branded Markdown + PDF; all seven sections + assets |

### Phase 5: Polish & Instrumentation (Weeks 11–12)

| # | Task | Deliverable |
|---|---|---|
| 5.1 | Implement cost ticker with hover breakdown and pricing-last-updated | Real-time display; tooltip with per-role/model breakdown |
| 5.2 | Implement telemetry logging (append-only, session-local) | All metric categories from §4.5 |
| 5.3 | Implement responsive preview toggles (Desktop/Tablet/Mobile) | Iframe resizing with device frames |
| 5.4 | Implement "New Conversation" reset flow | Clean teardown; confirmation dialog; ChlorastroliteLoader; welcome message |
| 5.5 | End-to-end testing: template path (all verticals) | QA pass across all 8 templates |
| 5.6 | End-to-end testing: scratch path | QA pass |
| 5.7 | End-to-end testing: deployment to all three hosts | QA pass |
| 5.8 | Token acquisition guide content review and accuracy check | Verify all URLs, steps, screenshots are current |

---

## 11. Key Design Decisions & Rationale

| Decision | Choice | Rationale |
|---|---|---|
| **Client-side only (no backend)** | ✅ | Eliminates hosting cost; user keys go direct to LLM providers; simplifies architecture |
| **Template-first strategy** | ✅ | Gets ≥80% of users to a working preview in <30s; dramatically reduces LLM token usage |
| **Blue/green iframes (not server-side)** | ✅ | Zero latency; no server; `srcdoc` injection is instantaneous |
| **User cannot edit requirements text** | ✅ | Maintains quality; users influence via chat (natural language); AI translates to structured items |
| **On Deck is locked** | ✅ | Prevents race conditions; builder always has work ready; smooth pipeline |
| **Suggest new conversation vs. template-to-scratch pivot** | ✅ | Avoids complex state machines; clean restart with better prompt yields better results |
| **Cloudflare Pages for studio hosting** | ✅ | Unlimited bandwidth free; Workers integration; fastest CDN |
| **Leaflet + OSM over Google Maps** | ✅ | Zero cost; no API key; no usage limits; good enough for contact page maps |
| **Formspree/Netlify Forms over custom form handler** | ✅ | Zero backend; free tier covers low-volume use; reliable |
| **localStorage + IndexedDB over any external DB** | ✅ | Single-user app; no sync needed; zero cost; survives refresh |
| **AI-generated/stock imagery only (no upload for MVP)** | ✅ | Eliminates upload UI, storage concerns, and image processing; SVG logos + Unsplash cover needs |
| **Single active session (no multi-session for MVP)** | ✅ | Simplifies state management; matches usage profile (1–2 users/day) |
| **Manual token paste (not OAuth for MVP)** | ✅ | No OAuth redirect complexity; step-by-step guides bridge the UX gap; simpler to implement |
| **Guardrails always enforced (no override for MVP)** | ✅ | Eliminates cross-cutting YOLO mode complexity (~4 dev days saved); no dual-mode testing; single code path for prompt composition, PO arbitration, builder validation, and telemetry; target audience wants the expertise, not an escape hatch |
| **Static system prompt (no conditional template)** | ✅ | Direct consequence of no YOLO mode; simpler to write, test, debug, iterate |
| **LLM-only cost tracking for MVP** | ✅ | Simplest meaningful metric; hosting is $0 anyway for free tiers |
| **User-site-branded documentation (not studio-branded)** | ✅ | User's deliverable should feel like theirs; small studio attribution in footer |

---

## 12. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| LLM-generated code has bugs/regressions | Preview shows broken site | Medium | Blue/green swap validates before showing; AI self-review step; Lighthouse audit |
| User's first message is ambiguous (bad classification) | Wrong template selected | Medium | AI asks a clarifying question if confidence <0.7; easy "New Conversation" escape |
| Free-tier host limits exceeded | Deploy fails or site goes down | Low (given traffic) | Monitor usage; auto-select alternate host; warn user |
| API key management in localStorage | Potential XSS exposure | Low | AES-256 encryption; CSP headers; no third-party scripts; subresource integrity |
| User gets frustrated with PO denying re-orders | Perceived lack of control | Low | AI always explains why; suggests alternatives; complies after two pushbacks with inline caveat; tone is collaborative |
| Generated sites look too similar (template fatigue) | Perceived low quality | Low | Rich customization; AI-driven copy/imagery; multiple layout variants per template |
| LLM costs surprise users | Trust erosion | Medium | Running total always visible; breakdown on hover; no hidden costs |
| Deploy tokens expire without user noticing | Deploy fails | Low | Validate tokens on each deploy attempt; clear error message with re-acquisition guide link |
| Unsplash API rate limit hit (50 req/hr) | Missing images in build | Low | Fallback to CSS gradients/SVG patterns; template images cached |
| Token acquisition guides become stale (provider UI changes) | User can't get tokens | Medium | Review quarterly; guides stored as updatable Markdown; link to official docs as backup |

---

## 13. Derived Requirements

| ID | Requirement | Area |
|---|---|---|
| **DR-1.1** | Token acquisition guides must include exact URLs to token creation pages for each provider | Deploy |
| **DR-1.2** | Guides must be written for someone who has never used GitHub/Netlify/Cloudflare | Deploy |
| **DR-1.3** | Guides must be reviewed quarterly and updated; stored as structured Markdown hot-swappable without code deploy | Deploy |
| **DR-1.4** | Each guide includes an inline "Test your token" validation button | Deploy |
| **DR-2.1** | Builder AI must generate SVG logos inline (text-based, monogram, or geometric) | Templates |
| **DR-2.2** | Builder AI should reference Unsplash API for contextual photography (free tier, 50 req/hr) | Templates |
| **DR-2.3** | All generated images must include `alt` text | Accessibility |
| **DR-2.4** | Fallback: if Unsplash unavailable or rate-limited, use CSS gradients or inline SVG patterns | Templates |
| **DR-4.1** | `MODEL_PRICING` lookup table must be easily updatable (JSON config file, not hardcoded) | Cost Ticker |
| **DR-4.2** | Unknown model used → display "Cost: unknown" with explanatory tooltip | Cost Ticker |
| **DR-4.3** | Include "Last updated" date in cost tooltip | Cost Ticker |

---

## 14. Deferred Features

### 14.1 YOLO Mode (Guardrail Override Toggle) — Deferred to Phase 6

| Attribute | Detail |
|---|---|
| **Deferred from** | MVP (v1.2 decision, February 25, 2026) |
| **Target phase** | Phase 6 (post-launch, user-feedback-driven) |
| **Trigger to re-evaluate** | 3+ distinct users request override; technically savvy segment emerges; studio opens to broader audience |
| **Scope when re-introduced** | Settings → Advanced → YOLO toggle; confirmation dialog; dynamic system prompt with `{{#if yoloMode}}` branching; YOLO-aware PO arbitration (bypass approval); YOLO-aware builder validation (skip quality checks); 🤠 badge in header; telemetry tracking of enable/disable events and suppressed guardrail firings |
| **Full prior spec** | Archived in PRD v1.1 §8 — not deleted, available for reference |

### 14.2 User Image Upload — Deferred to Post-MVP

| Attribute | Detail |
|---|---|
| **Deferred from** | MVP |
| **Trigger** | User feedback requesting logo/photo upload |
| **Scope** | Upload field in settings or chat; store in IndexedDB; inject into VFS; resize/optimize pipeline |

### 14.3 Multi-Session Support — Deferred to Post-MVP

| Attribute | Detail |
|---|---|
| **Deferred from** | MVP |
| **Trigger** | Usage exceeds single-session model (multiple clients in same day) |
| **Scope** | Session list sidebar; switch between conversations; independent VFS/backlog per session |

### 14.4 OAuth-Based Deploy Authentication — Deferred to Post-MVP

| Attribute | Detail |
|---|---|
| **Deferred from** | MVP |
| **Trigger** | User friction with manual token paste |
| **Scope** | OAuth redirect flows for GitHub, Netlify, Cloudflare; token refresh; richer permission management |

---

## 15. Glossary

| Term | Definition |
|---|---|
| **Blue/Green Swap** | Two identical iframe slots; one visible (serving), one hidden (building); swap atomically on successful build |
| **Chat AI** | The LLM persona acting as Product Owner; manages conversation, backlog, design decisions |
| **Builder AI** | The LLM persona acting as Developer; generates code, patches VFS |
| **ChlorastroliteLoader** | Custom React SVG animation component shown in the preview area when no build is active; has `gem` (default) and `eye` (easter egg) variants |
| **On Deck** | The single locked work item queued for the builder to pick up next |
| **PO** | Product Owner — the AI's role in backlog management |
| **Scratch Path** | When user's request doesn't match any template; AI builds from zero |
| **Template Path** | When user's request matches a pre-built template; fast-track to preview |
| **VFS** | Virtual File System — in-memory representation of the generated web app's files |
| **Zero-Cost Solution** | Any technology/service that operates entirely within a free tier |

---
