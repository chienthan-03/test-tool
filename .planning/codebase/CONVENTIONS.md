# Coding Conventions

**Analysis Date:** 2026-05-25

## Code Style

**TypeScript:**
- Strict typing with explicit types on public APIs
- ESM modules only (`import` / `export`)
- Import paths use `.js` suffix for compiled output compatibility
- `const` arrow functions for handlers and helpers (e.g. `src/app/bootstrap.ts`, `src/execution/adapter-factory.ts`)
- Early returns for guard clauses (e.g. `src/execution/adapter-factory.ts` mode checks)

**Formatting:**
- No Prettier/ESLint config in repo; `npm run lint` runs `tsc --noEmit` only
- Indentation: 2 spaces (observed in `src/`, `tests/`)

## Naming Conventions

**Files:**
- kebab-case: `binance-futures-adapter.ts`, `news-pipeline.ts`
- Test files: `<module>.test.ts` under `tests/unit/` or `tests/integration/`

**Functions:**
- camelCase: `createAdapter`, `loadConfigWithEnv`, `registerStartCommand`
- Event handlers: descriptive names (`handleOrderPlan`, `wireExecution`)

**Types / Classes:**
- PascalCase classes: `BinanceMarket`, `RiskEngine`, `NewsRepository`
- Types in `src/core/types.ts`: `TradeIntent`, `OrderPlan`, `Fill`

**Constants:**
- Module-level maps and enums via Zod (`MarginModeSchema`, `timeframeEnum` in `src/config/schema.ts`)

## Common Patterns

**Factory for adapters:**
- `createAdapter(mode, config, db?, bus?)` in `src/execution/adapter-factory.ts`

**Repository pattern:**
- One file per aggregate under `src/storage/repositories/`

**Event bus:**
- `AppEventBus` with typed `on` / `emit` (`src/core/event-bus.ts`)

**Config:**
- Single `AppConfig` from Zod parse; no scattered `process.env` except secrets in adapter factory and validate command

**CLI registration:**
- Each command exports `registerXCommand(program: Command)` from `src/cli/commands/*.ts`

## Documentation Style

**README:**
- Bilingual sections (Vietnamese + English summary) in `README.md`

**Specs:**
- Markdown design docs under `docs/superpowers/specs/` and `docs/superpowers/plans/`

**Code comments:**
- Minimal; logic intended to be self-explanatory
- Log messages use snake_case keys: `order_plan_executed`, `trade_closed`

## Git / Project

**Commits:**
- Conventional prefixes observed: `docs:`, feature branches on `main`

---

*Conventions analysis: 2026-05-25*
