# Lociros documentation

This folder is the product, technical, and design specification for Lociros. It describes the running app.

| Document | What it covers |
| -------- | -------------- |
| [Product](./product.md) | Why Lociros exists, who it is for, the reading loop, scope |
| [Architecture](./architecture.md) | Stack, repo layout, request flow, persistence, known gaps |
| [Design](./design.md) | Visual language, typography, layouts, components, interaction |
| [API](./api.md) | HTTP endpoints, headers, payloads, error codes |
| [NLP and CEFR](./nlp-and-cefr.md) | Generation, analyzers, validators, lexicons, kanji |
| [Learner model](./learner-model.md) | Device identity, placement, lemmas, next-text ranking |
| [Deploy](./deploy.md) | Vercel (frontend and admin), Supabase Postgres, FastAPI in Docker on Lightsail |

For a shorter operator’s guide (how to run, env vars, tests), see the [root README](../README.md).
