---
name: roleplay-chat-architect
description: Use this skill whenever building, extending, or debugging the roleplay chat bot project (Next.js + Elysia + Supabase + Google Gemini API, mobile-first PWA). Covers persona system design, model-cascade routing between Gemini models to save cost, context/memory management (rolling summaries, vector RAG memory, context caching), the hidden inner-thought pattern for giving bots consistent personality, Supabase schema conventions for this project, and mobile-first PWA UI patterns. Trigger this any time the user mentions the bot's persona/character system, chat memory, Gemini model selection, token/context cost, or the chat UI — even if they don't say "roleplay" explicitly, e.g. "add a new bot field", "the bot forgot what I said", "make the chat cheaper", "fix the mobile keyboard covering the input box".
---

# Roleplay Chat Architect

A project-specific skill for building the roleplay chat bot app: **Next.js (mobile-first PWA) + Elysia (Bun) + Supabase (Postgres/pgvector) + Google Gemini API**.

This skill encodes the architecture decisions already made for this project so that new work stays consistent with them, instead of re-deriving the stack from scratch each session.

## Project snapshot (assume this unless told otherwise)

- **Frontend:** Next.js App Router, Tailwind, PWA (installable, mobile-first — design for thumb reach, bottom nav/input bar, `viewport-fit=cover` for keyboard handling)
- **Backend:** Elysia running on Bun — thin API layer between frontend and Gemini/Supabase
- **DB:** Supabase — Postgres + pgvector + Auth + Storage
- **AI:** Google Gemini API, model-cascade (cheap model first, escalate only when needed)
- **Core differentiators:** fully custom bot persona, long-term memory, bot that seems to "think" before answering

When a request touches one of these areas, follow the patterns below rather than inventing a new approach.

---

## 1. Persona system

Persona is a **row in `bots`**, not a hardcoded prompt. Minimum fields:

```
bots
  id, user_id, name, avatar_url,
  personality (text)        -- freeform description
  system_prompt (text)      -- compiled from personality + speech style + example lines
  temperature (float)       -- per-bot creativity knob
  created_at
```

- Compile `system_prompt` server-side from structured fields (name, backstory, speech style, likes/dislikes, boundaries) rather than storing one giant blob the user hand-writes — this keeps personas editable field-by-field in the UI later.
- Give personas actual opinions/dislikes in the prompt. A bot that agrees with everything reads as flat — see the inner-thought pattern below for making this consistent turn-to-turn.

## 2. Gemini model cascade (cost control)

Never call the most expensive model by default. Route by complexity:

1. **Default → Gemini Flash-Lite tier** (cheapest, current default per project decision: `gemini-3.5-flash-lite`). Use for the vast majority of roleplay turns.
2. **Escalate → Flash tier** (`gemini-3.6-flash` or current equivalent) when the message is long, references earlier plot points heavily, or the user explicitly asks for something more thoughtful.
3. **Escalate → Pro tier** only for genuinely hard reasoning turns (complex plot branching, multi-character scenes). This should be rare — most roleplay doesn't need it.

Implement the cascade as a small classifier step in Elysia (message length, keyword heuristics, or a cheap Flash-Lite call that tags complexity) — not a manual per-request user toggle.

**Always check current Gemini pricing/model names before hardcoding a model string** — Google renames and reprices this lineup every few months, and the 2.5 family is being deprecated. If unsure, search rather than assume.

## 3. Context & memory management

Layer these together, cheapest first:

| Layer | Purpose | Trigger |
|---|---|---|
| Context caching | Cache the persona/system prompt (rarely changes) | Every request |
| Sliding window | Keep last N raw messages | Every request |
| Rolling summary | Compress older turns into a short summary block | Every ~15–20 messages |
| Vector memory (pgvector) | Store standout facts as embeddings, retrieve only relevant ones (RAG) | On fact-worthy turns; retrieve on every request |

Never send the full raw chat history once it exceeds a modest turn count — replace older turns with the rolling summary. This is the main lever for both cost and staying under context limits.

## 4. Inner-thought pattern ("bot has its own mind")

Before the bot's visible reply, have the model emit a hidden field (e.g. `inner_thought`) reasoning about mood, relationship to the user, and what it actually wants to say — then the visible reply is generated consistent with that. This is what makes persona feel stable across a long conversation instead of drifting toward generic-assistant tone. Store `inner_thought` server-side if useful for debugging persona consistency, but never render it to the end user.

## 5. Mobile-first UI checklist

Apply this whenever touching the chat UI:

- Bottom-anchored input bar, safe-area padding for notches
- Touch targets ≥44px
- `viewport-fit=cover` + resize handling so the virtual keyboard never covers the input
- Lazy-load avatars/images, keep payload small on mobile data
- PWA manifest + service worker for installability

## 6. When you're unsure

- Gemini pricing/model names, Supabase MCP capabilities, and Elysia/Bun APIs all change fast — search current docs rather than relying on memorized specifics, especially for anything cost- or version-related.
- If a request seems to contradict a decision above (e.g. "let's switch off Supabase"), flag the conflict rather than silently overriding it — these were deliberate choices for this project.
