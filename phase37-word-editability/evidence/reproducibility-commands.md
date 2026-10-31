# Phase 37 Reproducibility Commands

```bash
npx tsx scripts/run_phase37_production_pipeline.ts
npx vitest run tests/phase37-*.test.ts
npx tsc --noEmit
npm --prefix apps/web run build
```
