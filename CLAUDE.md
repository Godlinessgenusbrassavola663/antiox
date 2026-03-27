# CLAUDE.md

## Overview

**antiox** - "I Wish I Was Writing Rust" (Anti Oxide)

Small utilities for Rust/Tokio-like primitives in TypeScript. Zero overhead, no custom DSL. API matches Rust/Tokio wherever possible.

## Git

- Use single-line conventional commit messages. No co-authors.
- Example: `git commit -m "feat(sync): add broadcast channel"`

## API Reference

Always reference the Tokio and Rust standard library docs when implementing or modifying modules:
- Tokio: https://docs.rs/tokio/latest/tokio/
- Rust std: https://doc.rust-lang.org/std/
- tokio-stream: https://docs.rs/tokio-stream/latest/tokio_stream/

## Module Structure

Mirrors Tokio/Rust module hierarchy:

```
antiox/panic            → std::panic!, std::todo!, std::unreachable!
antiox/sync/mpsc        → tokio::sync::mpsc
antiox/sync/oneshot     → tokio::sync::oneshot
antiox/sync/watch       → tokio::sync::watch
antiox/sync/broadcast   → tokio::sync::broadcast
antiox/sync/semaphore   → tokio::sync::Semaphore
antiox/sync/notify      → tokio::sync::Notify
antiox/sync/mutex       → tokio::sync::Mutex
antiox/sync/rwlock      → tokio::sync::RwLock
antiox/sync/barrier     → tokio::sync::Barrier
antiox/sync/select      → tokio::select!
antiox/task             → tokio::task
antiox/time             → tokio::time
antiox/stream           → tokio_stream / futures::stream
```

Each module is a separate subpath export in `package.json` and a separate entry point in `tsup.config.ts`.

## Build

```bash
pnpm build       # Build all modules
pnpm check-types # Type check
pnpm test        # Run tests
```

## Documentation

- Keep `README.md` up to date when adding or changing modules.

## Code Style

- camelCase for method/function names (TypeScript convention)
- Structure and semantics match Tokio/Rust APIs
- Zero runtime dependencies
- Dual ESM/CJS output via tsup
