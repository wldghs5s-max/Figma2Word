# Phase 38 Reproducibility Commands

```bash
npx tsx scripts/run_phase38_production_pipeline.ts
npx vitest run tests/phase38-*.test.ts
npx tsc --noEmit
npm --prefix apps/web run build
```
