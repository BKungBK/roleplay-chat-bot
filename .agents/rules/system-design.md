# System Design Guidelines & Rules

1. **Requirement Analysis**:
   - Explicitly list data entities, relationships, state transitions, and throughput requirements before writing code.
2. **Database Modeling (Supabase / Postgres)**:
   - Define exact column types, primary keys, foreign key constraints, indexes, and pgvector embeddings.
   - Enforce Row Level Security (RLS) policies on every table.
3. **API Contract Design (ElysiaJS / Bun)**:
   - Define TypeBox schemas for body, query, params, and response payload validation.
   - Separate business logic into explicit services/handlers.
4. **AI Architecture Integration**:
   - Map requests into the Gemini model cascade (Flash-Lite $\rightarrow$ Flash $\rightarrow$ Pro).
   - Leverage context caching and rolling summaries for long conversations.
