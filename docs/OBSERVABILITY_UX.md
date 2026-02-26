# Resilience, Observability & Waiting UX

## 1. Fragility Map — Where Things Break

Every system call, LLM interaction, and state transition is a potential failure point. Here's the complete map, ranked by likelihood and severity:

### 1.1 Failure Taxonomy

```
FRAGILITY RISK MATRIX

                        High Severity
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          │  SCAFFOLD        │  LLM RETURNS     │
          │  CORRUPTION      │  UNPARSEABLE     │
          │  (rare but       │  PATCH JSON      │
          │   catastrophic)  │  (common,        │
          │                  │   recoverable)   │
          │                  │                  │
 Low ─────┼──────────────────┼──────────────────┼───── High
 Likelihood                  │                  │     Likelihood
          │                  │                  │
          │  DEPLOY TOKEN    │  LLM TIMEOUT /   │
          │  EXPIRED         │  RATE LIMIT      │
          │  (rare,          │  (common,        │
          │   clear error)   │   recoverable)   │
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                        Low Severity
```

### 1.2 Complete Failure Catalog

| # | Failure | Likelihood | Severity | Category |
|---|---|---|---|---|
| **F1** | LLM returns malformed JSON (not a valid patch) | **High** | Medium | LLM Output |
| **F2** | LLM returns valid JSON but wrong schema (missing fields, wrong op types) | **High** | Medium | LLM Output |
| **F3** | LLM returns a patch that targets a section that doesn't exist | Medium | Medium | LLM Output |
| **F4** | LLM returns a patch that modifies files not in `filesTouch` | Medium | Medium | LLM Output |
| **F5** | LLM times out (no response within threshold) | Medium | Low | LLM Infra |
| **F6** | LLM rate limited (429) | Medium | Low | LLM Infra |
| **F7** | LLM API returns 500/503 (provider outage) | Low | Medium | LLM Infra |
| **F8** | LLM returns a patch that breaks scaffold anchors | Low | **High** | Scaffold |
| **F9** | Accumulated patches cause anchor nesting corruption over many iterations | Low | **High** | Scaffold |
| **F10** | Blue/green iframe fails to render (JS error in generated code) | Medium | Medium | Preview |
| **F11** | Continuity check fails (theme drift, unrelated changes) | Medium | Low | Continuity |
| **F12** | Context window overflow (conversation + manifest + sections exceed model limit) | Low | Medium | LLM Context |
| **F13** | User's API key is invalid or has insufficient credits | Low | Medium | Config |
| **F14** | Unsplash API rate limit hit during build | Low | Low | External |
| **F15** | Deploy token expired or revoked | Low | Medium | Deploy |
| **F16** | Deploy target API error (GitHub/Netlify/CF outage) | Low | Medium | Deploy |
| **F17** | First-message classification picks wrong template | Medium | Low | Classification |
| **F18** | Builder enters a retry loop (keeps producing bad patches) | Low | **High** | System |
| **F19** | VFS grows beyond IndexedDB storage limits | Very Low | Medium | Storage |
| **F20** | Browser tab crashes or user accidentally closes during build | Low | Medium | Client |

---

## 2. Recovery Strategy for Each Failure

### 2.1 Strategy Classification

Every failure gets one of four strategies:

| Strategy | When to Use | User Experience |
|---|---|---|
| **Silent Retry** | Transient failures where retry is likely to succeed; user shouldn't know | User sees nothing; maybe a slight delay |
| **Informed Retry** | Retry is happening but taking longer than expected; user should know we're working on it | Friendly status message in chat |
| **Graceful Degrade** | Full success isn't possible but a partial or alternative result is acceptable | User gets something useful, with explanation |
| **Fail Fast** | Continuing would make things worse, or the problem requires user action | Clear error, specific remediation steps, no retry |

### 2.2 Recovery Map

| # | Failure | Strategy | Behavior |
|---|---|---|---|
| **F1** | Malformed JSON | **Silent Retry** (×2) → **Informed Retry** (×1) → **Graceful Degrade** | Retry 1-2: re-prompt with "Your previous output was not valid JSON. Output ONLY a JSON object." Retry 3: tell user "This one's tricky — I'm taking another approach." Final: skip atom, PO re-decomposes it into 2 smaller atoms |
| **F2** | Wrong schema | **Silent Retry** (×1) → **Informed Retry** (×1) → **Graceful Degrade** | Retry includes specific validation errors: "Missing field: targetVersion". Same escalation as F1 |
| **F3** | Section doesn't exist | **Silent Retry** (×1) → **Fail Fast** | Include section manifest in retry prompt. If still wrong, skip atom with chat message |
| **F4** | Wrong files touched | **Silent Retry** (×1) → **Fail Fast** | Re-prompt with explicit file constraint. If still violating, skip atom |
| **F5** | LLM timeout | **Silent Retry** (×1) → **Informed Retry** (×1) → **Graceful Degrade** | Retry with same prompt. If second timeout, tell user. Third: try with smaller context or cheaper/faster model |
| **F6** | Rate limited | **Informed Retry** with backoff | Wait per Retry-After header; show "Waiting a moment for the API..." in chat |
| **F7** | Provider outage | **Informed Retry** (×1) → **Graceful Degrade** → **Fail Fast** | Retry once after 10s. Then suggest user switch models in settings. If no alternative configured, pause with clear explanation |
| **F8** | Scaffold broken | **Fail Fast** | Do NOT swap. Discard patch. Restore VFS to pre-patch state. Log diagnostic. PO tells user "I caught an issue with that build — retrying with a different approach." Auto-retry with stricter prompt |
| **F9** | Anchor corruption | **Fail Fast + Heal** | Detected by periodic scaffold audit. If found: attempt auto-repair of anchors. If unrepairable: rollback VFS to last known-good version + chat notification |
| **F10** | Iframe render error | **Informed Retry** (×1) → **Graceful Degrade** | Catch via iframe `postMessage` error reporting. Retry build. If persistent: swap but show warning overlay in preview "⚠ Preview may have issues" |
| **F11** | Continuity check fail | **Silent Retry** (×1) → **Informed Retry** (×1) | Include violation details in retry prompt. Second failure: skip atom, PO explains |
| **F12** | Context overflow | **Graceful Degrade** | Reduce context: drop oldest conversation turns, summarize, trim adjacent sections to signatures only |
| **F13** | Invalid API key | **Fail Fast** | Immediate validation error in settings. During build: "Your API key was rejected — please check it in Settings" |
| **F14** | Unsplash rate limit | **Graceful Degrade** | Fall back to CSS gradients/SVG patterns. Note in chat: "Used a pattern background — you can update images later" |
| **F15** | Deploy token expired | **Fail Fast** | "Your GitHub token has expired. Here's how to create a new one: [expand guide]" |
| **F16** | Deploy API error | **Informed Retry** (×1) → **Fail Fast** | Retry once. Then: "GitHub is having issues right now. Try again in a few minutes, or deploy to [alternative host]" |
| **F17** | Wrong template | **Graceful Degrade** | User can always start a new conversation. PO should detect template strain early and proactively suggest restart |
| **F18** | Retry loop | **Fail Fast** | Circuit breaker: max 3 total retries per atom. After 3: skip atom, PO explains, move to next |
| **F19** | IndexedDB full | **Fail Fast** | Detect before write. "Your browser storage is full. Export your site and clear browser data." |
| **F20** | Tab close/crash | **Graceful Degrade** | VFS persists in IndexedDB. On reload: detect incomplete session, offer to resume from last committed VFS version |

### 2.3 The Circuit Breaker Pattern

Every build attempt runs through a circuit breaker that prevents infinite retry loops:

```typescript
interface CircuitBreaker {
  atomId: string;
  attempts: number;
  maxAttempts: 3;
  lastError: string;
  state: 'closed' | 'open' | 'half-open';
}

class BuildCircuitBreaker {
  private breakers: Map<string, CircuitBreaker> = new Map();

  canAttempt(atomId: string): boolean {
    const breaker = this.breakers.get(atomId);
    if (!breaker) return true;  // First attempt
    if (breaker.state === 'open') return false;  // Failed out
    return breaker.attempts < breaker.maxAttempts;
  }

  recordFailure(atomId: string, error: string): 'retry' | 'skip' {
    const breaker = this.getOrCreate(atomId);
    breaker.attempts++;
    breaker.lastError = error;

    if (breaker.attempts >= breaker.maxAttempts) {
      breaker.state = 'open';
      return 'skip';
    }
    return 'retry';
  }

  recordSuccess(atomId: string): void {
    this.breakers.delete(atomId);
  }
}
```

---

## 3. Observability — How Do We Know If the Builder Is Stuck or Working Hard?

### 3.1 The Problem

From the user's perspective, there are only two states: **"something is happening"** and **"nothing is happening."** But internally, the build pipeline has many stages, each with different expected durations. We need to distinguish:

| Internal State | User Should See |
|---|---|
| Builder is waiting for LLM response (normal) | Progress — "Writing your services section…" |
| Builder is waiting for LLM but it's taking long | Reassurance — "Still working — this section is more complex than usual" |
| Builder got a bad response, silently retrying | Nothing changes from user's view (silent retry) |
| Builder is on retry #2 with informed retry | Transparency — "Ran into a snag, trying a different approach…" |
| Builder has failed this atom and is skipping | Honesty — "Couldn't build that one right now — moving on to the next item" |
| Builder is idle waiting for On Deck | Calm — no activity indicator; backlog is visible |
| Builder is paused (user requested) | Confirmation — "⏸ Paused" badge on On Deck |

### 3.2 Internal Build State Machine

```typescript
type BuildPhase =
  | 'idle'                    // No work to do or paused
  | 'assembling_context'      // Building the context window for the LLM
  | 'awaiting_llm'            // Waiting for LLM response
  | 'parsing_patch'           // Parsing LLM output into patch format
  | 'validating_patch'        // Schema + scaffold + continuity checks
  | 'applying_patch'          // Writing to VFS clone
  | 'rendering_preview'       // Injecting into green iframe
  | 'validating_preview'      // Checking iframe rendered without errors
  | 'swapping'                // Blue/green swap animation
  | 'retrying'                // Failed, preparing retry
  | 'skipping'                // Circuit breaker tripped, moving on
  | 'error';                  // Unrecoverable error, needs user action

interface BuildState {
  phase: BuildPhase;
  currentAtom: WorkItem | null;
  startedAt: number;
  phaseStartedAt: number;
  retryCount: number;
  lastError: string | null;
}
```

### 3.3 Timeout Thresholds per Phase

| Phase | Expected Duration | Warning Threshold | Timeout |
|---|---|---|---|
| `assembling_context` | <1 second | 3 seconds | 5 seconds |
| `awaiting_llm` | 5–30 seconds | 45 seconds | 90 seconds |
| `parsing_patch` | <0.5 seconds | 2 seconds | 5 seconds |
| `validating_patch` | <0.5 seconds | 2 seconds | 5 seconds |
| `applying_patch` | <0.5 seconds | 2 seconds | 5 seconds |
| `rendering_preview` | 1–3 seconds | 10 seconds | 20 seconds |
| `validating_preview` | 1–3 seconds | 10 seconds | 20 seconds |
| `swapping` | <0.5 seconds | — | 2 seconds |

```typescript
const PHASE_TIMEOUTS: Record<BuildPhase, { warn: number; timeout: number }> = {
  assembling_context:  { warn: 3000,  timeout: 5000 },
  awaiting_llm:        { warn: 45000, timeout: 90000 },
  parsing_patch:       { warn: 2000,  timeout: 5000 },
  validating_patch:    { warn: 2000,  timeout: 5000 },
  applying_patch:      { warn: 2000,  timeout: 5000 },
  rendering_preview:   { warn: 10000, timeout: 20000 },
  validating_preview:  { warn: 10000, timeout: 20000 },
  swapping:            { warn: 2000,  timeout: 2000 },
  // idle, retrying, skipping, error: no timeouts
};
```

### 3.4 Heartbeat Monitor

```typescript
class BuildHeartbeat {
  private timer: ReturnType<typeof setInterval>;
  
  start(buildState: BuildState, onWarning: () => void, onTimeout: () => void) {
    this.timer = setInterval(() => {
      const elapsed = Date.now() - buildState.phaseStartedAt;
      const thresholds = PHASE_TIMEOUTS[buildState.phase];
      
      if (!thresholds) return;
      
      if (elapsed > thresholds.timeout) {
        onTimeout();
      } else if (elapsed > thresholds.warn) {
        onWarning();
      }
    }, 1000);  // Check every second
  }
  
  stop() {
    clearInterval(this.timer);
  }
}
```

---

## 4. User-Facing Communication — The Narration Layer

### 4.1 Design Principle: Translate, Don't Expose

The user should **never** see internal system language. Every build phase maps to a human-friendly narration:

```
INTERNAL                          USER SEES
─────────────────────────────     ──────────────────────────────────
assembling_context                (nothing — too fast to notice)
awaiting_llm                      "Writing your services section…"
awaiting_llm (> warn threshold)   "Still working — this one needs
                                   a bit more thought…"
parsing_patch                     (nothing — too fast)
validating_patch                  (nothing — too fast)
applying_patch                    (nothing — too fast)
rendering_preview                 "Previewing the changes…"
swapping                          "✨ Updated!"
retrying (silent, attempt 1-2)    (nothing)
retrying (informed, attempt 3)    "Ran into a snag — trying a 
                                   different approach…"
skipping                          "Couldn't nail that one — I've
                                   moved on to [next item title]"
error                             "I need your help with something
                                   — [specific action needed]"
```

### 4.2 The Three Communication Channels

The system communicates with the user through three distinct channels, each with a different purpose and tone:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  CHANNEL 1: Chat Messages (permanent, conversational)            │
│  ─────────────────────────────────────────────────                │
│  • PO explanations ("I added a testimonials section because...")  │
│  • Error messages requiring user action                          │
│  • Milestone celebrations ("Your site is deployed! 🎉")          │
│  • Skip explanations ("Couldn't build X, here's why...")         │
│  │                                                                │
│  CHANNEL 2: Status Bar (transient, below preview iframe)         │
│  ─────────────────────────────────────────────────                │
│  • Current build phase ("Writing your services section…")        │
│  • Progress indicator (pulsing dot or subtle progress bar)       │
│  • Time elapsed for current atom                                 │
│  │                                                                │
│  CHANNEL 3: Backlog Visual State (persistent, glanceable)        │
│  ─────────────────────────────────────────────────                │
│  • On Deck card shows current activity state                     │
│  • Work item cards show done/in-progress/queued                  │
│  • Completed items get checkmarks                                │
│  │                                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key rule:** Channels never contradict each other. If the status bar says "Writing services section," the On Deck card must show that atom as "In Progress."

### 4.3 Status Bar Design

The status bar sits directly below the preview iframe — it's the user's primary awareness channel for what the builder is doing:

```
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│                     PREVIEW IFRAME                             │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│ ● Writing your services section…                         23s  │
└──────────────────────────────────────────────────────────────┘
  ↑                                                          ↑
  Pulsing dot                                          Elapsed
  (color-coded)                                        timer
```

**Dot color semantics:**

| Color | Meaning |
|---|---|
| 🟢 Green (pulsing) | Working normally |
| 🟡 Amber (pulsing) | Taking longer than expected; still working |
| 🔴 Red (static) | Error; needs attention (accompanied by chat message) |
| ⚪ Gray (static) | Idle / paused |

**Status bar text mapping:**

```typescript
function getStatusText(state: BuildState): string {
  const atom = state.currentAtom;
  const elapsed = Date.now() - state.phaseStartedAt;
  const threshold = PHASE_TIMEOUTS[state.phase];

  switch (state.phase) {
    case 'idle':
      return 'Ready';
    
    case 'assembling_context':
      return `Preparing to work on "${atom.title}"…`;
    
    case 'awaiting_llm':
      if (elapsed > threshold.warn) {
        return getSlowMessages(atom, state.retryCount);
      }
      return getBuildingMessages(atom);
    
    case 'parsing_patch':
    case 'validating_patch':
    case 'applying_patch':
      return 'Checking the changes…';
    
    case 'rendering_preview':
    case 'validating_preview':
      return 'Previewing the changes…';
    
    case 'swapping':
      return '✨ Updated!';
    
    case 'retrying':
      if (state.retryCount <= 2) {
        return getBuildingMessages(atom); // Silent retry — same message
      }
      return 'Trying a different approach…';
    
    case 'skipping':
      return `Moved on — couldn't build "${atom.title}" this time`;
    
    case 'error':
      return 'Paused — check the chat for details';
  }
}
```

### 4.4 Building Messages — Variety to Stave Off Boredom

Here's the critical UX insight: **if the user sees the same "Working on X…" message for 30 seconds, it feels frozen even when it's not.** The message needs to evolve. But it should evolve in a way that feels natural, not mechanical.

```typescript
function getBuildingMessages(atom: WorkItem): string {
  // Map atom type to contextual building verbs
  const verbs: Record<string, string[]> = {
    structure: ['Building', 'Constructing', 'Setting up', 'Creating'],
    content:   ['Writing', 'Crafting', 'Composing', 'Filling in'],
    style:     ['Styling', 'Polishing', 'Refining', 'Tuning'],
    behavior:  ['Wiring up', 'Adding interactivity to', 'Programming', 'Connecting'],
    integration: ['Connecting', 'Integrating', 'Setting up', 'Linking'],
  };

  const verb = pickRandom(verbs[atom.atomType] ?? ['Working on']);
  return `${verb} your ${atom.title.toLowerCase()}…`;
}

function getSlowMessages(atom: WorkItem, retryCount: number): string {
  // These rotate every ~8 seconds to give a sense of movement
  const messages = [
    `Still working on "${atom.title}" — this one needs a bit more thought…`,
    `Almost there — making sure everything fits together…`,
    `Taking a little longer than usual — good things take time…`,
    `Putting the finishing touches on this piece…`,
  ];
  
  if (retryCount > 0) {
    messages.push(
      `Trying a slightly different approach to "${atom.title}"…`,
      `Rethinking this one — want to get it right…`,
    );
  }

  // Cycle through messages based on elapsed time
  const index = Math.floor((Date.now() - atom.startedAt) / 8000) % messages.length;
  return messages[index];
}
```

### 4.5 Chat Message Templates (Channel 1)

These are the permanent messages that appear in the chat thread. They should be informative but not noisy.

#### Success Messages (after every swap)

```typescript
const swapMessages: Record<string, (atom: WorkItem) => string> = {
  structure: (a) => `✅ Added: **${a.visibleChange}**`,
  content:   (a) => `✅ Updated: **${a.visibleChange}**`,
  style:     (a) => `✅ Styled: **${a.visibleChange}**`,
  behavior:  (a) => `✅ Connected: **${a.visibleChange}**`,
  integration: (a) => `✅ Integrated: **${a.visibleChange}**`,
};

// Examples:
// "✅ Added: New services section appears on the homepage with 4 cards"
// "✅ Styled: Primary color updated to forest green across all sections"
// "✅ Connected: Contact form now sends emails via Formspree"
```

**Key design choice: these messages use the atom's `visibleChange` field** — the one-sentence description of what the user should see. This means the PO's decomposition work directly feeds the user's understanding.

#### Skip Messages

```
I couldn't build "Add filterable portfolio grid" after a few tries. 
I've moved it to the end of the backlog and I'll take another 
approach when we get back to it. In the meantime, I'm working 
on "Add about section copy" next.
```

#### Error Messages Requiring User Action

```
⚠️ Your OpenAI API key was rejected. This usually means:
• The key has expired
• Your account has run out of credits
• The key was revoked

→ Check your key in **Settings > LLM Keys**
→ Or switch to a different model in **Settings > Models**

I've paused building until this is resolved.
```

#### Milestone Messages

```
🎉 **First preview ready!**
Your site is live in the preview. Take a look and let me know 
what you think. I'm already working on the next improvement.

---

🚀 **Deployed!**
Your site is live at: https://joes-plumbing.github.io
I've prepared a documentation packet with everything you need 
to know. [Download docs]
```

### 4.6 How Much Inner Monologue?

This is the core UX judgment call. Here's the framework:

#### The User Should See

| Event | See It? | Channel | Rationale |
|---|---|---|---|
| "Working on services section" | ✅ Yes | Status bar | User knows the system is alive and what it's doing |
| "This one's taking longer" | ✅ Yes | Status bar | Prevents "is it frozen?" anxiety |
| "Added: services section with 4 cards" | ✅ Yes | Chat | Permanent record; user knows what changed |
| "Skipped an item" | ✅ Yes | Chat | Transparency; user should know if something was skipped |
| "Need your help (API key issue)" | ✅ Yes | Chat | Requires action |
| "I reorganized the backlog because X depends on Y" | ✅ Yes | Chat | PO should explain its reasoning |
| "Working on atom 5 of 12" | ✅ Yes | Backlog panel (visual, not text) | Progress is visible through checkmarks accumulating |

#### The User Should NOT See

| Event | See It? | Rationale |
|---|---|---|
| "LLM returned malformed JSON, retrying" | ❌ No | Implementation detail; user can't act on it |
| "Retry attempt 2 of 3 with temperature 0.2" | ❌ No | Too technical; would cause anxiety |
| "Scaffold validation passed" | ❌ No | No news is good news |
| "Continuity check: 6/6 passed" | ❌ No | User doesn't know what continuity checks are |
| "Context window at 78% capacity" | ❌ No | Internal metric |
| "Patch applied to VFS clone, running diff" | ❌ No | Plumbing |
| Raw LLM output or prompts | ❌ No | Never. Not even in a "debug mode" for MVP |

#### The Gray Zone — Show Only If It Affects the User

| Event | Show If… | Channel |
|---|---|---|
| "Switched from gpt-4o to gpt-4o-mini for this build" | Model fallback happened due to timeout/error | Chat (brief: "Switched to a faster model for this step") |
| "Using a pattern background instead of a photo" | Unsplash was unavailable | Chat (brief: "Used a pattern — you can update the image later") |
| "I'd suggest trying a different prompt" | Template path is being strained | Chat (full explanation + example prompt) |

---

## 5. Scaffold Health — The Slow Killer

This deserves special attention because it's the most insidious failure mode. Unlike LLM errors (which are loud and immediate), scaffold degradation is **silent and cumulative.**

### 5.1 How Scaffolds Degrade

After 15–20 patches, small errors accumulate:

```
Build 1:   <!-- PP:SECTION:hero --> ... <!-- /PP:SECTION:hero -->     ✅ Clean
Build 7:   <!-- PP:SECTION:hero --> ... <!-- /PP:SECTION:hero -->     ✅ Still clean
Build 12:  <!-- PP:SECTION:hero --> ... <!-- /PP:SECTION:hero  -->    ⚠️ Extra space
Build 15:  <!-- PP:SECTION:hero --> ... <!-- / PP:SECTION:hero -->    ⚠️ Worse
Build 18:  <!-- PP:SECTION:hero --> ... <!-- PP:SECTION:hero -->      🔴 Missing slash
```

Or more subtly:

```
Build 1:   <section class="hero" data-pp-section="hero">       ✅
Build 9:   <section class="hero hero--dark" data-pp-section="hero">  ✅ Fine
Build 14:  <section class="hero hero--dark" data-pp="hero">    🔴 Truncated attribute
```

### 5.2 Scaffold Health Monitor

```typescript
interface ScaffoldHealth {
  score: number;           // 0-100
  sectionsIntact: number;  // Count of valid sections
  sectionsTotal: number;   // Expected total
  cssBlocksIntact: number;
  cssBlocksTotal: number;
  jsFuncsIntact: number;
  jsFuncsTotal: number;
  issues: ScaffoldIssue[];
}

interface ScaffoldIssue {
  severity: 'warning' | 'error';
  file: string;
  anchor: string;
  problem: 'missing_open' | 'missing_close' | 'malformed' | 'mismatched' | 'orphaned';
  autoRepairable: boolean;
}

class ScaffoldAuditor {
  // Run AFTER every patch application, BEFORE swap
  audit(vfs: VirtualFileSystem): ScaffoldHealth {
    const issues: ScaffoldIssue[] = [];

    for (const [path, file] of vfs.files) {
      // Check HTML section anchors
      if (path.endsWith('.html')) {
        issues.push(...this.auditHtmlAnchors(path, file.content));
      }
      // Check CSS block anchors
      if (path.endsWith('.css')) {
        issues.push(...this.auditCssAnchors(path, file.content));
      }
      // Check JS function anchors
      if (path.endsWith('.js')) {
        issues.push(...this.auditJsAnchors(path, file.content));
      }
    }

    const score = this.calculateHealthScore(issues, vfs);
    return { score, issues, ...this.countIntact(vfs) };
  }

  // Auto-repair common issues
  repair(vfs: VirtualFileSystem, issues: ScaffoldIssue[]): RepairResult {
    const repairableIssues = issues.filter(i => i.autoRepairable);
    let repaired = 0;

    for (const issue of repairableIssues) {
      switch (issue.problem) {
        case 'missing_close':
          // Re-insert closing anchor based on next section's opening anchor
          repaired++;
          break;
        case 'malformed':
          // Normalize anchor format (fix whitespace, slashes)
          repaired++;
          break;
        // ...
      }
    }

    return { repaired, unrepairable: issues.length - repaired };
  }
}
```

### 5.3 Health-Triggered Actions

| Health Score | Status | Action |
|---|---|---|
| 90–100 | 🟢 Healthy | Continue normally |
| 70–89 | 🟡 Degraded | Auto-repair after current build. Log warning. |
| 50–69 | 🟠 At Risk | Pause after current atom. Run full repair. Validate repair. Resume. User doesn't see this unless repair fails. |
| <50 | 🔴 Critical | **Stop building.** Roll back to last known-good VFS snapshot. Inform PO. PO tells user: "I've restored your site to a stable checkpoint. Recent changes may need to be redone." |

### 5.4 VFS Snapshots (Safety Net)

```typescript
class VFSSnapshotManager {
  private snapshots: Map<number, VirtualFileSystem> = new Map();
  private maxSnapshots = 5;  // Keep last 5 known-good states

  // Called after every successful swap (scaffold health ≥ 90)
  saveSnapshot(vfs: VirtualFileSystem): void {
    this.snapshots.set(vfs.version, this.deepClone(vfs));
    
    // Prune old snapshots
    if (this.snapshots.size > this.maxSnapshots) {
      const oldest = Math.min(...this.snapshots.keys());
      this.snapshots.delete(oldest);
    }
  }

  // Called when scaffold health drops critically
  rollback(): { vfs: VirtualFileSystem; lostVersions: number } {
    const latest = Math.max(...this.snapshots.keys());
    const snapshot = this.snapshots.get(latest)!;
    return {
      vfs: this.deepClone(snapshot),
      lostVersions: snapshot.version - latest,
    };
  }
}
```

---

## 6. Context Window Management — Preventing Silent Overflow

### 6.1 The Problem

After a long conversation (30+ messages) and a complex site (20+ sections), the context window for both the Chat AI and Builder AI can overflow silently — causing degraded output quality before hitting a hard token limit.

### 6.2 Context Budget System

```typescript
interface ContextBudget {
  model: string;
  maxTokens: number;         // Model's context window
  reservedForOutput: number;  // Tokens reserved for the response
  available: number;          // maxTokens - reservedForOutput

  // Budget allocation
  systemPrompt: number;       // Fixed cost
  siteManifest: number;       // Grows slowly (new sections/pages)
  affectedSections: number;   // Varies per atom
  adjacentContext: number;    // 0-2 sections, read-only
  workItem: number;           // Small, fixed
  patchFormat: number;        // Fixed
  conversationHistory: number; // VARIABLE — this is what we trim
}

class ContextManager {
  private budget: ContextBudget;

  assembleBuildContext(atom: WorkItem, vfs: VirtualFileSystem): BuildContext {
    // 1. Calculate fixed costs
    const fixedCost =
      this.budget.systemPrompt +
      this.budget.siteManifest +
      this.budget.workItem +
      this.budget.patchFormat;

    // 2. Calculate section costs for this atom
    const sectionCost = this.estimateSectionTokens(atom, vfs);

    // 3. Remaining budget goes to conversation history
    const historyBudget = this.budget.available - fixedCost - sectionCost;

    // 4. Trim conversation to fit
    const history = this.trimConversation(historyBudget);

    // 5. If STILL over budget, reduce section context
    if (this.totalTokens() > this.budget.available) {
      return this.assembleMinimalContext(atom, vfs);
    }

    return { ...context, history };
  }

  private trimConversation(budget: number): ChatMessage[] {
    // Strategy: Keep first message (establishes intent) +
    //           last N messages that fit within budget +
    //           summary of trimmed middle section
    const messages = store.conversation;
    const first = messages[0];
    const rest = messages.slice(1);

    let kept: ChatMessage[] = [first];
    let tokens = this.estimateTokens(first);

    // Walk backward from most recent
    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(rest[i]);
      if (tokens + msgTokens > budget - 100) break;  // 100 token buffer
      kept.unshift(rest[i]);
      tokens += msgTokens;
    }

    // If we trimmed messages, insert a summary
    if (kept.length < messages.length) {
      const trimmedCount = messages.length - kept.length;
      kept.splice(1, 0, {
        sender: 'system',
        content: `[${trimmedCount} earlier messages summarized: User requested a ${store.session.path} site. Key decisions: ${this.summarizeDecisions()}]`,
      } as ChatMessage);
    }

    return kept;
  }
}
```

### 6.3 When Context Gets Critically Tight

| Available Context | Strategy |
|---|---|
| ≥ 60% for sections + history | Normal operation |
| 40–60% | Trim conversation to first + last 5 messages + summary |
| 20–40% | Trim conversation to first + last 2 messages; reduce adjacent sections to signatures only (section name + first line) |
| <20% | **Graceful degrade:** Warn PO. PO suggests "We've been going for a while — want me to summarize where we are and continue fresh?" Start a soft conversation reset that preserves VFS but clears history |

---

## 7. Session Recovery — Surviving the Unexpected

### 7.1 Browser Crash / Accidental Close

```typescript
// On every successful VFS commit, persist to IndexedDB
class SessionPersistence {
  async persistCheckpoint(): Promise<void> {
    await db.put('checkpoint', {
      session: store.session,
      vfs: store.vfs,
      backlog: store.backlog,
      conversation: store.conversation.slice(-20),  // Last 20 messages
      buildState: 'idle',  // Always persist as idle — will re-evaluate on load
      lastSavedAt: Date.now(),
    });
  }

  async detectRecovery(): Promise<RecoveryState | null> {
    const checkpoint = await db.get('checkpoint');
    if (!checkpoint) return null;
    if (!checkpoint.session) return null;
    if (checkpoint.session.status === 'deployed') return null;  // Already finished

    return {
      hasRecoverableSession: true,
      lastSavedAt: checkpoint.lastSavedAt,
      vfsVersion: checkpoint.vfs.version,
      backlogRemaining: checkpoint.backlog.filter(i => i.status === 'backlog').length,
    };
  }
}
```

**On app load, if a recovery is detected:**

```
┌──────────────────────────────────────────────┐
│                                              │
│  Welcome back! 👋                            │
│                                              │
│  It looks like you were working on a site    │
│  for "Joe's Plumbing" when the session       │
│  ended unexpectedly.                         │
│                                              │
│  Your site was at version 12 with 5 backlog  │
│  items remaining.                            │
│                                              │
│  [Resume where I left off]  [Start fresh]    │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 8. Consolidated Observability Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BUILD PIPELINE                          │
│                                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │
│  │ Context │→ │   LLM   │→ │  Patch  │→ │  Preview  │  │
│  │ Assembly│  │  Call    │  │ Validate│  │  Render   │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────┬─────┘  │
│       │            │            │              │         │
│       ▼            ▼            ▼              ▼         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              EVENT BUS (internal)                    │ │
│  │  phase_changed | retry | timeout | error | swap     │ │
│  └────────┬────────────────┬─────────────┬─────────────┘ │
│           │                │             │               │
└───────────┼────────────────┼─────────────┼───────────────┘
            │                │             │
   ┌────────▼───────┐  ┌────▼────┐  ┌─────▼──────┐
   │ NARRATION      │  │ HEALTH  │  │ TELEMETRY  │
   │ LAYER          │  │ MONITOR │  │ LOGGER     │
   │                │  │         │  │            │
   │ Translates     │  │ Scaffold│  │ Append-    │
   │ events into    │  │ auditor │  │ only log   │
   │ user-facing    │  │ Circuit │  │ to         │
   │ messages       │  │ breaker │  │ IndexedDB  │
   │                │  │ Snapshot│  │            │
   └──────┬─────────┘  │ manager│  └────────────┘
          │             └────────┘
   ┌──────┼──────────────────────────┐
   │      ▼          ▼          ▼    │
   │  Status Bar   Chat    Backlog   │
   │  (transient)  (perm)  (visual)  │
   │                                 │
   │         USER INTERFACE          │
   └─────────────────────────────────┘
```

---

## 9. Integration Checklist for the PRD

These are the new artifacts and changes this design produces:

| Area | Addition |
|---|---|
| **§2.2 Subsystems** | Add: Narration Layer, Scaffold Health Monitor, Context Manager, Session Recovery |
| **§3 Epic 3** | New Feature 3.3: Build Status Bar UI; New Feature 3.4: Session Recovery |
| **§5** | New §5.7: Circuit Breaker; New §5.8: Context Budget System; New §5.9: Scaffold Health Monitor; New §5.10: VFS Snapshot Manager |
| **§7.1 Data Model** | Add: `BuildState`, `ScaffoldHealth`, `CircuitBreaker`, `ContextBudget` interfaces |
| **§7.2 Storage** | Add: VFS snapshots (IndexedDB), session checkpoint (IndexedDB) |
| **§8 UI** | Add: Status bar wireframe below preview iframe; recovery dialog wireframe |
| **§9.1 Chat AI Prompt** | Add: Narration guidelines — what to say on swap, skip, error, milestone |
| **§9.2 Builder AI Prompt** | Add: Retry instructions — "Your previous output failed because [X]. Please correct:" |
| **§10 Roadmap** | Phase 1: Add heartbeat monitor + status bar; Phase 3: Add circuit breaker + scaffold health + snapshots + context manager; Phase 5: Add session recovery |
| **§12 Risk Register** | Update F8 (scaffold corruption) and F18 (retry loop) with these mitigation mechanisms |

---
