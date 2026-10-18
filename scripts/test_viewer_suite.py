import subprocess
import time
import ctypes
import os
import sys
from ctypes import wintypes

user32 = ctypes.windll.user32

VIEWER_EXE = r"C:\Program Files (x86)\Hnc\Office 2024 Viewer\HOffice130\Bin\HwpViewer.exe"

def kill_all_viewers():
    subprocess.run(["taskkill", "/F", "/IM", "HwpViewer.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["taskkill", "/F", "/IM", "msedgewebview2.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)

def test_hwpx_file(hwpx_path):
    kill_all_viewers()
    abs_path = os.path.abspath(hwpx_path)
    if not os.path.exists(abs_path):
        return "FILE_NOT_FOUND", ""

    proc = subprocess.Popen([VIEWER_EXE, abs_path])
    pid = proc.pid
    time.sleep(3.5)

    # Check process state
    ret = proc.poll()
    if ret is not None:
        kill_all_viewers()
        return "CRASHED_OR_CLOSED", f"exit_code={ret}"

    # Enumerate top-level windows for this process
    windows = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    
    def enum_wnd(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        wnd_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wnd_pid))
        if wnd_pid.value == pid:
            buf = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, buf, 512)
            cls_buf = ctypes.create_unicode_buffer(512)
            user32.GetClassNameW(hwnd, cls_buf, 512)
            windows.append((cls_buf.value, buf.value))
        return True

    user32.EnumWindows(WNDENUMPROC(enum_wnd), 0)
    kill_all_viewers()

    # Analyze windows
    # If error dialog appeared: title or text contains error / warning / alert
    # If document loaded successfully: main window title is not empty, usually contains title or "한글 뷰어"
    titles = [w[1] for w in windows if w[1] and "Hancom AD" not in w[1] and "Cicero" not in w[1] and "IME" not in w[1]]
    
    # Check for error dialogs
    for cls, title in windows:
        if "오류" in title or "error" in title.lower() or "경고" in title or cls == "#32770":
            return "FAIL_ERROR_DIALOG", f"title={title}, cls={cls}"

    if not titles:
        return "FAIL_NO_WINDOW", f"all_windows={windows}"

    main_title = titles[0]
    return "PASS", main_title

def main():
    files_to_test = [
        "debug/hwpx-phase20-baseline/stage1-korean-text.hwpx",
        "debug/hwpx-phase20-baseline/stage2-typography.hwpx",
        "debug/hwpx-phase20-baseline/stage3-rect-line.hwpx",
        "debug/hwpx-phase20-baseline/stage4-textbox-oval-vector.hwpx",
        "debug/hwpx-phase20-baseline/stage5-images.hwpx",
        "debug/hwpx-phase21/diag-line-only.hwpx",
        "debug/hwpx-phase21/diag-rect-ratio.hwpx",
        "debug/hwpx-phase21/diag-rect-stroke.hwpx",
        "debug/hwpx-phase21/diag-oval-only.hwpx",
        "debug/hwpx-phase21/diag-polygon-only.hwpx",
    ]

    print("=" * 60)
    print("HWPX COMPATIBILITY DIAGNOSTIC TEST RUNNER")
    print("=" * 60)

    for f in files_to_test:
        status, detail = test_hwpx_file(f)
        basename = os.path.basename(f)
        print(f"[{status:18}] {basename:30} => {detail}")

if __name__ == "__main__":
    main()

