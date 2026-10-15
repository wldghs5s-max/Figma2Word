import json

with open("research/rea-document-engine/phase13c/metrics_baseline.json", "r", encoding="utf-8-sig") as f:
    data = json.load(f)

for r in data:
    print(f"\n========================================================")
    print(f"=== {r['name']} (Engine: {r['engine']})")
    print(f"=== Mean SSIM: {r['meanSsim']:.4f} | Min SSIM: {r['minSsim']:.4f} (Page {r['worstPage']}) | Mean MAE: {r['meanMae']:.2f}")
    print(f"========================================================")
    with open(r['metricsPath'], "r", encoding="utf-8-sig") as mf:
        mdata = json.load(mf)
        for p in mdata['pages']:
            delta = p.get('delta', {})
            dx = delta.get('x', 0) if isinstance(delta, dict) else 0
            dy = delta.get('y', 0) if isinstance(delta, dict) else 0
            dw = delta.get('w', 0) if isinstance(delta, dict) else 0
            dh = delta.get('h', 0) if isinstance(delta, dict) else 0
            print(f"  Page {p['page']:2d}: SSIM={p['ssim']:6.4f} | MAE={p['mae']:5.2f} | Mismatch={p['mismatchRatio']*100:5.2f}% | dX={dx:3d}, dY={dy:3d}, dW={dw:3d}, dH={dh:3d}")
