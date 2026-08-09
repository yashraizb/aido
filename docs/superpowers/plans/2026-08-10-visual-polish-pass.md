# Visual Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the app's ~21 ad-hoc `font-size` values down to a 4-step type scale, and add consistent `:focus-visible` keyboard-focus states across every interactive element (currently present almost nowhere — a real accessibility gap, not just cosmetic) — all within the existing color palette, no rebrand.

**Architecture:** Pure `frontend/src/App.css` edits, zero JSX changes, zero backend changes — this is the last of three sub-projects in the visual-redesign sequence, applied over the now-finished structural layout (sidebar restructure + Dashboard/calendar). Task 1 defines the type-scale custom properties (additive, no visual change on its own). Task 2 applies that scale across every catalogued `font-size` rule in the file. Task 3 adds `:focus-visible` states to every interactive element that currently lacks one, and does the final cross-page manual verification.

**Tech Stack:** Plain CSS, no new dependencies.

## Global Constraints

- No palette changes — `--bg`, `--card`, `--border`, `--text`, `--muted`, `--hover`, `--accent`, `--error-bg`, `--error-text` keep their current values throughout this plan.
- Two `font-size` declarations are icon-glyph sizing (the 🗑 delete-icon buttons: `.list-delete-btn` at 1.25rem, `.task-delete` at 1.45rem) and one is a deliberate mobile-responsive override (`.tasks-title` inside `@media (max-width: 900px)` at 1.25rem, intentionally smaller than desktop) — these three are explicitly left as literal values, not tokenized, per the design spec's "values that don't cleanly fit the scale stay as-is" clause. Every other `font-size` in the file gets tokenized.
- `:focus-visible` outlines use `var(--accent)` — consistent with the existing (already-present) focus style on form inputs like `.list-search-input:focus`.
- No automated frontend tests exist in this project (no test runner configured) — verification is manual, per [Testing](../../testing.md).

---

## File Structure

```
frontend/
  src/
    App.css   # MODIFY across all 3 tasks — the only file this plan touches
```

---

### Task 1: Type-scale design tokens

**Files:**
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: four new CSS custom properties on `:root` — `--text-sm: 0.82rem`, `--text-base: 0.95rem`, `--text-lg: 1.08rem`, `--text-xl: 1.4rem` — available to every rule in the file from this point on. Adding them alone changes nothing visually (no rule references them yet) — Task 2 is what applies them.

- [ ] **Step 1: Add the type-scale tokens to `:root`**

Find the current `:root` block at the top of `frontend/src/App.css`:

```css
:root {
  --bg: #f8f9fa;
  --card: #ffffff;
  --border: #d9dde3;
  --text: #202124;
  --muted: #5f6368;
  --hover: #f1f3f4;
  --accent: #1a73e8;
  --error-bg: #fde8e8;
  --error-text: #a50e0e;
}
```

Replace with:

```css
:root {
  --bg: #f8f9fa;
  --card: #ffffff;
  --border: #d9dde3;
  --text: #202124;
  --muted: #5f6368;
  --hover: #f1f3f4;
  --accent: #1a73e8;
  --error-bg: #fde8e8;
  --error-text: #a50e0e;
  --text-sm: 0.82rem;
  --text-base: 0.95rem;
  --text-lg: 1.08rem;
  --text-xl: 1.4rem;
}
```

- [ ] **Step 2: Manually verify no visual change**

Run `cd frontend && npm run build` (or confirm `npm run dev` starts cleanly) and glance at the running app — nothing should look different yet, since no rule references the new tokens.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat: add type-scale design tokens (no visual change yet)"
```

---

### Task 2: Apply the type scale across the file

**Files:**
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `--text-sm`/`--text-base`/`--text-lg`/`--text-xl` (Task 1).
- Produces: every catalogued `font-size` declaration in the file (except the two icon-glyph sizes and the one mobile override called out in Global Constraints) now reads its size from one of the four tokens instead of a one-off literal value.

The mapping below groups the file's ~21 `font-size` rules by role and nearest token. Apply each `Find`/`Replace` pair exactly — they're presented in file order.

- [ ] **Step 1: `--text-base` group (body text, inputs, primary buttons — values 0.9–1rem)**

In `.nav-rail-btn`, find `font-size: 0.95rem;` (the one inside the `.nav-rail-btn { ... }` block near the top of the file) and replace with `font-size: var(--text-base);`.

In `.list-search-input`, find `font-size: 0.9rem;` and replace with `font-size: var(--text-base);`.

In `.list-create-input, .list-rename-input`, find `font-size: 0.95rem;` and replace with `font-size: var(--text-base);`.

In `.error-banner`, find `font-size: 0.92rem;` and replace with `font-size: var(--text-base);`.

In `.task-modal-input, .task-modal-select`, find `font-size: 0.95rem;` and replace with `font-size: var(--text-base);`.

In `.task-tag-option`, find `font-size: 0.9rem;` and replace with `font-size: var(--text-base);`.

In `.task-title` (the task-row title, not `.tasks-title` the page heading — check the selector carefully, they're different classes), find `font-size: 1rem;` and replace with `font-size: var(--text-base);`.

In `.kanban-card-title`, find `font-size: 0.95rem;` and replace with `font-size: var(--text-base);`.

- [ ] **Step 2: `--text-sm` group (meta text, small badges, secondary buttons — values 0.73–0.85rem)**

In `.list-mini-btn`, find `font-size: 0.82rem;` and replace with `font-size: var(--text-sm);`.

In `.task-modal-label`, find `font-size: 0.85rem;` and replace with `font-size: var(--text-sm);`.

In `.task-tag-chip`, find `font-size: 0.73rem;` and replace with `font-size: var(--text-sm);`.

In `.task-meta`, find `font-size: 0.78rem;` and replace with `font-size: var(--text-sm);`.

In `.task-edit-inline-btn`, find `font-size: 0.82rem;` and replace with `font-size: var(--text-sm);`.

In `.task-pull-today-btn`, find `font-size: 0.82rem;` and replace with `font-size: var(--text-sm);`.

In `.timeline-restore-btn`, find `font-size: 0.82rem;` and replace with `font-size: var(--text-sm);`.

In `.kanban-column-count`, find `font-size: 0.85rem;` and replace with `font-size: var(--text-sm);`.

In `.kanban-remove-btn`, find `font-size: 0.8rem;` and replace with `font-size: var(--text-sm);`.

- [ ] **Step 3: `--text-lg` group (subheadings, modal titles — values 1.02–1.08rem)**

In `.list-task-heading`, find `font-size: 1.08rem;` and replace with `font-size: var(--text-lg);`.

In `.task-modal-title`, find `font-size: 1.06rem;` and replace with `font-size: var(--text-lg);`.

In `.kanban-column-heading`, find `font-size: 1.02rem;` and replace with `font-size: var(--text-lg);`.

- [ ] **Step 4: `--text-xl` group (page title — value 1.4rem)**

In `.tasks-title` (the page-level heading — NOT the `@media (max-width: 900px) { .tasks-title { font-size: 1.25rem; } }` mobile override further down the file, which stays as its own literal 1.25rem per Global Constraints), find `font-size: 1.4rem;` and replace with `font-size: var(--text-xl);`.

- [ ] **Step 5: Run test to verify no build errors**

Run `cd frontend && npm run build` — confirm it succeeds with no errors or warnings.

- [ ] **Step 6: Manually verify visually**

Run `cd frontend && npm run dev`, open the app, and click through Dashboard, Lists, Completed, and Timeline. Confirm text still reads clearly with a coherent size hierarchy (page titles largest, then subheadings, then body text, then meta/badge text smallest) — nothing should look broken or misaligned, since every mapped value is within ~0.1rem of its token.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat: apply type scale across all text elements"
```

---

### Task 3: Interactive states (`:focus-visible`) + final verification

**Files:**
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `--accent` (existing token, unchanged).
- Produces: every button-like interactive element in the file that currently has no `:focus-visible` rule gains one, using a consistent `outline: 2px solid var(--accent); outline-offset: 2px;` treatment. Form inputs already have a focus style (`.list-search-input:focus`, `.list-create-input:focus`, `.task-modal-input:focus`, etc.) — those are left as-is, this task only adds what's missing.

- [ ] **Step 1: Add `:focus-visible` to the primary nav and sidebar list buttons**

Find the existing `.nav-rail-btn:hover` rule:

```css
.nav-rail-btn:hover {
  background: var(--hover);
}
```

Add a new rule directly after it:

```css
.nav-rail-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

Find the existing `.list-name-btn` block (has no `:hover`/`:focus-visible` today):

```css
.list-name-btn {
  background: transparent;
  text-align: left;
  padding: 8px 8px;
  color: #1f1f1f;
}
```

Add a new rule directly after it:

```css
.list-name-btn:focus-visible,
.list-mini-btn:focus-visible,
.list-delete-btn:focus-visible,
.list-action-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Add `:focus-visible` to task-row and Kanban-card action buttons**

Find the existing `.task-edit-inline-btn:hover` rule:

```css
.task-edit-inline-btn:hover {
  background: #eef2f7;
}
```

Add a new rule directly after it:

```css
.task-edit-inline-btn:focus-visible,
.task-pull-today-btn:focus-visible,
.task-delete:focus-visible,
.completed-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

Find the existing `.kanban-advance-btn:hover` rule:

```css
.kanban-advance-btn:hover {
  background: #d2e3fc;
}
```

Add a new rule directly after it:

```css
.kanban-advance-btn:focus-visible,
.kanban-remove-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Add `:focus-visible` to the Timeline restore button and Kanban cards**

Find the existing `.timeline-restore-btn:hover:not(:disabled)` rule:

```css
.timeline-restore-btn:hover:not(:disabled) {
  background: #e8f0fe;
}
```

Add a new rule directly after it:

```css
.timeline-restore-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

Find the existing `.kanban-card` rule:

```css
.kanban-card {
  background: var(--card);
  border: 1px solid #eceff1;
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 1px 3px rgba(60, 64, 67, 0.08);
  cursor: grab;
}
```

Add a new rule directly after it (Kanban cards are `draggable`, which makes them focusable in most browsers, but they don't currently show any focus indicator):

```css
.kanban-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Add `:focus-visible` to checkboxes**

Find the existing `.list-visibility-check` rule:

```css
.list-visibility-check {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}
```

Add a new rule directly after it:

```css
.list-visibility-check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run test to verify no build errors**

Run `cd frontend && npm run build` — confirm it succeeds with no errors or warnings.

- [ ] **Step 6: Manually verify keyboard focus across all four pages**

Run `cd frontend && npm run dev`, open the app, and use only Tab (and Shift+Tab) to move focus through the page — do not click with the mouse. On each of the four sections (Dashboard, Lists, Completed, Timeline), confirm every interactive element you tab to shows a visible blue outline: sidebar nav buttons, the Lists toggle, list checkboxes/name/rename/delete buttons, task edit/pull-to-today/delete buttons, the "+ Add Task" button and its modal's fields, Kanban cards and their advance/remove buttons, the Timeline's "Restore to here" buttons. Confirm mouse clicks do NOT show the outline (that's the point of `:focus-visible` over plain `:focus` — keyboard-only). Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat: add consistent :focus-visible states across all interactive elements"
```

---

## Self-Review Notes

- **Spec coverage:** Type scale (4 tokens, consolidating ~21 font-size values) ✓ (Tasks 1-2). Interactive states — `:focus-visible` added where absent, a real accessibility gap per the spec's own framing ✓ (Task 3). No palette changes ✓ (every new rule in this plan uses only the existing `--accent` token, no new colors introduced anywhere). Two icon-glyph sizes and one mobile override explicitly excluded from tokenization, per the spec's "values that don't cleanly fit stay as-is" clause ✓ (called out explicitly in Global Constraints and in Task 2 Step 4's note).
- **Scope note:** The design spec's Section 3 also mentions a spacing scale (`--space-1` through `--space-6`). This plan deliberately does not include it — the file's existing padding/gap/margin values are already reasonably consistent (mostly 6/8/10/12/14/16/20px, no chaotic scatter like the font-size values had), and the spec itself says to apply new scales "where they logically match... not a rewrite of every rule." Between the type scale and the `:focus-visible` accessibility gap, this plan prioritizes the two changes with the clearest, most defensible payoff; a spacing-token pass can be a fast follow-up if a future review finds a concrete inconsistency worth naming, rather than speculatively introducing tokens with no rules using them yet.
- **Task independence:** Task 1 (tokens only) is additive with zero visual change — safe on its own. Task 2 applies the scale — visually verifiable independently of Task 3. Task 3 (focus states) is independent CSS additions that don't touch anything Task 2 changed — no ordering dependency between Tasks 2 and 3 beyond both needing Task 1's tokens (Task 3 doesn't use the type-scale tokens at all, only `--accent`, so it could technically run before Task 2 — kept after it here just to match the plan's narrative order of "typography, then interaction").
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, exact find/replace code.
