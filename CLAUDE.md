# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian community plugin (TypeScript) that augments notes with AI-generated proposals — relational links and tagged agent responses. See `SDD.md` for the full design.

## Key Files

- `SDD.md` — Software Design Document. The authoritative spec for behaviour and constraints.
- `TDD.md` — Technical Design Document. Implementation architecture (vendor choices, embeddings, pipeline, bootstrapping).
- `PLAN.md` — Implementation Plan. Control flow, module boundaries, build order, and phasing.
- `LOGBOOK.md` — Implementation progress. Phase status table and reverse-chronological log.
- `ARCHITECTURE.md` — System diagrams (Mermaid). Overview, flows, data model, lifecycle.
- `resources/INDEX.md` — Master index for the offline Obsidian plugin development reference library.
- `resources/api-reference.md` — Obsidian Plugin API (Vault, MetadataCache, Workspace, Editor, UI).
- `resources/best-practices.md` — Official guidelines and recommended patterns.
- `resources/community-standards.md` — Submission process, review criteria, manifest format, releases.
- `resources/gotchas.md` — 20 common pitfalls with fixes (threading, mobile, cache timing, etc.).
- `resources/production-readiness.md` — Testing, performance, CI/CD, accessibility, security.

## Key Technical Decisions

- **CM6 decorations** for inline accept/reject buttons on callouts (StateField, not ViewPlugin). Import `@codemirror/view` and `@codemirror/state` from Obsidian — never bundle your own CM6 packages.
- **`vault.process()`** for all file writes (atomic). Never `vault.append()` or `vault.modify()`.
- **`requestUrl()`** for all network calls (not `fetch()`). Community review requirement.
- **Shadow files** (one JSON per note) for embedding storage. Not `data.json`.

## Reference Lookup

When implementing, consult `resources/` files directly rather than searching online. They contain offline snapshots of Obsidian's plugin API docs, best practices, and community standards. The `resources/INDEX.md` cross-references SDD sections to relevant resource files.
