# Agent Project Context Memory

Last Updated: 2026-03-22 03:04 UTC

## 1) PROJECT OVERVIEW
**AI JOB OS** is a production-minded career intelligence platform. It transitions from a passive dashboard to an active Operating System where stateful AI agents (Atlas) execute job discovery, ranking, and outreach operations.

## 2) PRODUCT GOALS
- **Seamless Continuity**: Conversations and pipeline data survive refreshes and restarts via disk-based caching and LLM-driven state synchronization.
- **Strategic Execution**: The agent avoids "chatbot filler" and acts as a decisive system operator focused exclusively on job-related tasks.
- **Local Resilience**: Operational even without active PostgreSQL/Redis by falling back to local JSON persistence.

## 3) ACTIVE ARCHITECTURE DECISIONS
- **Local Resilience Mode**:
  - **Jobs**: Cached in `project_memory/local_jobs.json`.
  - **Sessions**: Persisted in `project_memory/local_sessions.json`.
  - This mode ensures the agent is functional in restricted local environments.
- **Unified Continuity Engine**:
  - **LLM-Driven Sync**: Mind, Soul, and Identity layers are updated via hidden `<continuity_update>` blocks in every turn.
  - **Consolidated State**: All auxiliary metadata (todos, tasks, summaries) is unified into the `Mind` layer within a single `agent_context.md` JSON structure.
  - **Rolling History**: Maintains a 30-turn window, archiving old messages into permanent summaries after turn 20 to manage token context.
  - **Continuity Sync Fix**: `<continuity_update>` blocks are only included in the FINAL conversational response, not during tool call rounds.
- **UI Pattern**: "OS Layout" – Fixed viewport, flex-column, pinned headers, and `whitespace-pre-wrap` for chat readability.
- **Agentic Tool Loop**:
  - `extractToolCalls()` uses a 3-strategy parser: fenced code blocks → brace matching → regex fallback.
  - `maxToolRounds` = 25 (supports batch operations like saving 10+ jobs).
  - When loop exhausts, a final LLM call generates a summary table.
  - `inferToolCallFromUserMessage` is DISABLED to prevent pipeline contamination.
  - Tool results are returned to the LLM with explicit instructions to continue or summarize.
  - **Multi-step continuation**: Continuation prompt includes the ORIGINAL USER REQUEST text, round count, and explicit instructions to complete ALL steps before summarizing. This prevents the model from stopping after completing only the first part of a multi-step task.
- **Browser Service**:
  - Port 3001 for standalone Playwright-based browser.
  - `executeSessionAction` auto-creates sessions on demand (no prior `browser_create_session` needed).
  - Adzuna is the primary reliable source (LinkedIn/Indeed/Glassdoor block automated access).

## 4) BUILD PROGRESS LOG
- **Refinement Phase**: Transitioned to "AI JOB OS" branding.
- **Persistence Phase**: Fixed session rehydration and job caching.
- **Personality Phase**: Hardened system prompt for strategic, non-robotic dialogue.
- **UI Phase**: Standardized layout and fixed overflow issues across all pages.
- **Stabilization Phase**: Unified `userId`, fixed session rehydration, achieved 16px vertical calibration, and implemented `save_job` persistence. 
- **Browser-First Architecture**: Retired legacy Adzuna API scrapers and mock "Demo Mode". All job discovery is now conducted via the standalone browser service (Port 3001). Corrected "Connectivity Timeouts" by increasing navigation thresholds to 30s and implementing lazy session initialization.
- **Continuity Upgrade**: Implemented "Unified Continuity" with LLM-driven layer updates and rolling history summarization. Consolidated auxiliary files into the primary context JSON.
- **Resilience Hardware**: Operational in "Local Resilience Mode" using local JSON stores to bypass DB/Redis dependencies.
- **Agentic Loop Fix (2026-03-21)**: Rewrote `extractToolCalls()` parser, fixed error short-circuit, added browser auto-session, disabled `inferToolCallFromUserMessage`, increased `maxToolRounds` to 25, added loop exhaustion summary call.
- **UI Bug Sweep (2026-03-21)**: Fixed 15 UI bugs including Dashboard chart rendering, Analytics charts, Apply button new-tab, Jobs loading flash, notifications Mark All Read, sidebar token count, chat markdown rendering, outreach detail drawer, settings skeleton, and user profile dropdown.
- **Tool Pipeline Hardening (2026-03-22)**: Prompt updated for batch saving (save ALL jobs, not just first), summary table at end, junk validation on POST `/api/jobs`, DELETE cleanup endpoint, sidebar Tool Use panel wired to actual tool log data with green/red status indicators. Apply button changed from `<button>` to real `<a target="_blank">` anchor tag.
- **Multi-Step Continuation Fix (2026-03-22)**: Agent was stopping after first step of multi-step tasks. Fixed by including original user request in continuation prompt with round counter and explicit "complete ALL steps before summarizing" instruction. Stress test confirmed: 3/3 Frontend Developer jobs saved successfully with summary table, sidebar tool logs with green dots, Apply ↗ new-tab working.

## 5) KEY FILES (QUICK REFERENCE)
| File | Purpose |
|------|---------|
| `src/lib/services/agent/conversation-orchestrator.ts` | Core agentic loop, tool parser, tool execution, continuation prompt |
| `src/lib/services/agent/prompt-composer.ts` | System prompt construction, tool format instructions |
| `src/lib/services/browser/service/browser-service.ts` | Browser session management, auto-session creation |
| `src/components/jobs/jobs-table.tsx` | Jobs pipeline table, Apply button, detail drawer |
| `src/components/agents/agent-chat-starter.tsx` | Agent chat UI, sidebar tool logs, markdown rendering |
| `src/app/api/jobs/route.ts` | Job CRUD API with junk validation + DELETE cleanup |
| `src/app/api/browser/route.ts` | Browser tool API endpoint |

## 6) KNOWN LIMITATIONS
- LinkedIn, Indeed, Glassdoor all block automated browser access (bot detection).
- Adzuna is currently the only reliable automated source for job extraction.
- PostgreSQL is optional; the app falls back to local JSON cache when unavailable.
- Jobs saved by the agent score 0 (no scoring pipeline on `save_job` yet).
- Location normalization is not yet implemented (raw source strings passed through).
- Multi-step sequential tasks may still require the model to be explicitly reminded of remaining steps (mitigated by continuation prompt fix but depends on LLM instruction-following quality).

