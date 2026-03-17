# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An Obsidian community plugin (TypeScript) that augments notes with AI-generated proposals — relational links and tagged agent responses. See `SDD.md` for the full design.

## Key Files

- `SDD.md` — Software Design Document. The authoritative spec for what we're building.
- `resources/INDEX.md` — Master index for the offline Obsidian plugin development reference library.
- `resources/api-reference.md` — Obsidian Plugin API (Vault, MetadataCache, Workspace, Editor, UI).
- `resources/best-practices.md` — Official guidelines and recommended patterns.
- `resources/community-standards.md` — Submission process, review criteria, manifest format, releases.
- `resources/gotchas.md` — 20 common pitfalls with fixes (threading, mobile, cache timing, etc.).
- `resources/production-readiness.md` — Testing, performance, CI/CD, accessibility, security.

## Reference Lookup

When implementing, consult `resources/` files directly rather than searching online. They contain offline snapshots of Obsidian's plugin API docs, best practices, and community standards. The `resources/INDEX.md` cross-references SDD sections to relevant resource files.
