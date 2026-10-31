# Phase 35.2 Sanitized Command Execution Log

```powershell
# 1. Real Figma JSON Validation
Get-Item "펜테크 3차 디자인.json" | Select-Object Length
Get-FileHash "펜테크 3차 디자인.json" -Algorithm SHA256

# 2. Production Pipeline Execution
$env:NODE_OPTIONS="--max-old-space-size=4096"
npx tsx scripts/run_phase35_2_production_recovery.ts

# 3. Microsoft Word Native COM Automation
powershell -ExecutionPolicy Bypass -File tools/visual-regression/windows_word_automation.ps1 `
  -DocxPath local-fidelity-artifacts/baseline/actual.docx `
  -PdfPath local-fidelity-artifacts/baseline/actual.pdf `
  -ImagesDir local-fidelity-artifacts/baseline/pages `
  -ScaleFactor 1.0

powershell -ExecutionPolicy Bypass -File tools/visual-regression/windows_word_automation.ps1 `
  -DocxPath local-fidelity-artifacts/candidate/actual.docx `
  -PdfPath local-fidelity-artifacts/candidate/actual.pdf `
  -ImagesDir local-fidelity-artifacts/candidate/pages `
  -ScaleFactor 1.0

# 4. Verification & Testing
npx vitest run
npx tsc --noEmit
npm --prefix apps/web run build
```
