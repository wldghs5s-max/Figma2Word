import json

for report_idx in [1, 2, 3]:
    base_file = f'research/rea-document-engine/phase13c/comparisons/baseline_canvas_vs_ref_report{report_idx}/metrics.json'
    impr_file = f'research/rea-document-engine/phase13c/comparisons/improved_canvas_vs_ref_report{report_idx}/metrics.json'
    
    with open(base_file, encoding='utf-8-sig') as f:
        base = json.load(f)
    with open(impr_file, encoding='utf-8-sig') as f:
        impr = json.load(f)
        
    print(f'=== REPORT {report_idx} ===')
    print(f"Mean SSIM: {base['meanSsim']} -> {impr['meanSsim']} (delta: {impr['meanSsim'] - base['meanSsim']:+.4f})")
    print(f"Mean MAE:  {base['meanMae']} -> {impr['meanMae']} (delta: {impr['meanMae'] - base['meanMae']:+.2f})")
    print(f"Mismatch:  {base['meanMismatchRatio']*100:.2f}% -> {impr['meanMismatchRatio']*100:.2f}%")
    print('Page | Base SSIM | Impr SSIM | Delta SSIM | Base MAE | Impr MAE | Base Mis% | Impr Mis%')
    print('-----|-----------|-----------|------------|----------|----------|-----------|----------')
    for b_pg, i_pg in zip(base['pages'], impr['pages']):
        p = b_pg['page']
        bs, is_ = b_pg['ssim'], i_pg['ssim']
        bm, im = b_pg['mae'], i_pg['mae']
        bmr, imr = b_pg['mismatchRatio']*100, i_pg['mismatchRatio']*100
        print(f'{p:4d} | {bs:.4f}    | {is_:.4f}    | {is_-bs:+.4f}    | {bm:6.2f}   | {im:6.2f}   | {bmr:6.2f}%   | {imr:6.2f}%')
    print()
