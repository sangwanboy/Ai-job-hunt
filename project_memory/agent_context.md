# Agent Project Context Memory

Last Updated: 2026-03-18

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
- **UI Pattern**: "OS Layout" – Fixed viewport, flex-column, pinned headers, and `whitespace-pre-wrap` for chat readability.

## 4) BUILD PROGRESS LOG
- **Refinement Phase**: Transitioned to "AI JOB OS" branding.
- **Persistence Phase**: Fixed session rehydration and job caching.
- **Personality Phase**: Hardened system prompt for strategic, non-robotic dialogue.
- **UI Phase**: Standardized layout and fixed overflow issues across all pages.
- **Stabilization Phase**: Unified `userId`, fixed session rehydration, achieved 16px vertical calibration, and implemented `save_job` persistence. 
- **Browser-First Architecture**: Retired legacy Adzuna API scrapers and mock "Demo Mode". All job discovery is now conducted via the standalone browser service (Port 3001). Corrected "Connectivity Timeouts" by increasing navigation thresholds to 30s and implementing lazy session initialization.
- **Continuity Upgrade**: Implemented "Unified Continuity" with LLM-driven layer updates and rolling history summarization. Consolidated auxiliary files into the primary context JSON.
- **Resilience Hardware**: Operational in "Local Resilience Mode" using local JSON stores to bypass DB/Redis dependencies.
