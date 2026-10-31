# Phase 35.1 Reproducible Execution Commands

The following commands reproduce the complete verification suite of Phase 35.1:

```bash
# 1. Verification of all test suites (including integrity gate negative tests)
npx vitest run

# 2. TypeScript type check
npx tsc --noEmit

# 3. Production web build
npm --prefix apps/web run build

# 4. Word COM automation safety check (exits 1 on non-existent file)
powershell -ExecutionPolicy Bypass -File "tools/visual-regression/windows_word_automation.ps1" -DocxPath "non-existent.docx" -PdfPath "out.pdf" -ImagesDir "out_images"

# 5. Recovery pipeline in default blocked mode (enforces provenance gate when 186MB JSON is absent)
npx tsx scripts/run_phase35_1_real_recovery.ts

# 6. Recovery pipeline on real local customer snapshot
npx tsx scripts/run_phase35_1_real_recovery.ts --json debug/customer/Report1-Live-Snapshot.json --outDir scratch/real_customer_test
```
