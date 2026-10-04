"""Exercise the compiled native APK against an isolated API and sample catalog."""
import json
import os
import re
import secrets
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path.cwd()
OUT = ROOT / "qa-output"
OUT.mkdir(exist_ok=True)
PACKAGE = "com.aonemart.app"
checks = []
keyboard_checks = []
last_tree = None


def adb(*args, timeout=30):
    result = subprocess.run(["adb", *args], stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace") + result.stdout.decode(errors="replace"))
    return result.stdout


def dump():
    global last_tree
    adb("shell", "uiautomator", "dump", "/sdcard/aone-ui.xml")
    data = adb("exec-out", "cat", "/sdcard/aone-ui.xml")
    (OUT / "last-ui.xml").write_bytes(data)
    last_tree = ET.fromstring(data)
    return last_tree


def find(label, desc=False, exact=False, sensitive=False):
    tree = dump()
    needle = label if sensitive else label.casefold()
    matches = []
    for node in tree.iter("node"):
        texts = [node.get("content-desc", "")] if desc else [node.get("text", ""), node.get("content-desc", "")]
        texts = texts if sensitive else [text.casefold() for text in texts]
        bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
        if len(bounds) != 4 or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
            continue
        if any(text == needle if exact or desc else needle in text for text in texts):
            matches.append(node)
    matches.sort(key=lambda n: (n.get("clickable") != "true", not any((n.get(k, "") if sensitive else n.get(k, "").casefold()) == needle for k in ["text", "content-desc"])))
    return matches[0] if matches else None


def wait(label, desc=False, seconds=35, sensitive=False):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        node = find(label, desc=desc, sensitive=sensitive)
        if node is not None:
            return node
        time.sleep(1)
    raise RuntimeError(f"Native UI did not show: {label}")


def scroll():
    size = adb("shell", "wm", "size").decode()
    width, height = map(int, re.findall(r"(\d+)x(\d+)", size)[-1])
    adb("shell", "input", "swipe", str(width // 2), str(height * 4 // 5), str(width // 2), str(height // 4), "400")
    time.sleep(.6)


def click(label, desc=False):
    node = None
    for _ in range(5):
        node = find(label, desc=desc)
        if node is not None:
            break
        scroll()
    if node is None:
        raise RuntimeError(f"No visible native control: {label}")
    left, top, right, bottom = map(int, re.findall(r"\d+", node.get("bounds")))
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
    time.sleep(.6)


def admin_tab(label):
    for direction in [-1, 1]:
        for _ in range(6):
            node = find(label, desc=True)
            if node is not None:
                click(label, desc=True)
                return
            tree = last_tree
            labels = ["Dashboard", "Manage Inventory", "Active Orders", "Customers", "Sales & Invoices",
                      "Rewards & Coupons", "AI Summary", "Store Settings"]
            visible_tabs = [n for n in tree.iter("node") if n.get("content-desc") in labels]
            assert visible_tabs, "Admin navigation is not visible"
            left, top, right, bottom = map(int, re.findall(r"\d+", visible_tabs[0].get("bounds")))
            width = int(re.findall(r"(\d+)x\d+", adb("shell", "wm", "size").decode())[-1])
            start, end = (width * 9 // 10, width // 10) if direction == -1 else (width // 10, width * 9 // 10)
            adb("shell", "input", "swipe", str(start), str((top + bottom) // 2), str(end), str((top + bottom) // 2), "350")
            time.sleep(.5)
    raise RuntimeError("Cannot reach admin tab: " + label)


def keyboard_visible():
    # input_method includes historical client states after dismissal. Inspect
    # the current IME window, which matches what is actually on screen.
    windows = adb("shell", "dumpsys", "window", "windows").decode(errors="replace")
    return any(
        re.search(r"Window #\d+ Window\{[^\n]*InputMethod", block.splitlines()[0] if block else "")
        and re.search(r"^\s*isVisible=true\s*$", block, re.MULTILINE)
        for block in re.split(r"(?=Window #\d+ Window\{)", windows)
    )


def dismiss_keyboard():
    if keyboard_visible():
        click("Done", desc=True)
        deadline = time.monotonic() + 5
        while keyboard_visible() and time.monotonic() < deadline:
            time.sleep(.25)
        assert not keyboard_visible(), "Keyboard Done control did not dismiss the keyboard"


def fill(placeholder, value, keep_keyboard=False, replace=False):
    click(placeholder)
    if replace:
        node = find(placeholder, desc=True)
        assert node is not None and node.get("class", "").endswith("EditText"), "Cannot identify input for replacement"
        current = node.get("text", "") if node.get("hint", "false") != "true" else ""
        adb("shell", "input", "keyevent", "123")
        if current:
            adb("shell", "input", "keyevent", *(["67"] * len(current)))
    adb("shell", "input", "text", value.replace(" ", "%s"))
    if not keep_keyboard:
        dismiss_keyboard()
    time.sleep(.5)


def assert_input_above_keyboard(label, capture):
    time.sleep(1)
    assert keyboard_visible(), f"Software keyboard is not open for {label}"
    node = wait(label, desc=True, seconds=12)
    assert node.get("focused") == "true", f"{label} is not the focused input"
    bounds = list(map(int, re.findall(r"\d+", node.get("bounds"))))
    windows = adb("shell", "dumpsys", "window", "windows").decode(errors="replace")
    (OUT / f"keyboard-{capture}.txt").write_text(windows)
    frames = []
    for block in re.split(r"(?=Window #\d+ Window\{)", windows):
        if not re.search(r"Window #\d+ Window\{[^\n]*InputMethod", block.splitlines()[0] if block else ""):
            continue
        frame = re.search(r"(?:mFrame|\bframe)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]", block)
        if frame:
            coordinates = list(map(int, frame.groups()))
            # An IME window can fill the display with a transparent upper
            # area. Its supplied content inset identifies the visible keys.
            content_inset = re.search(r"mGivenContentInsets=\[\d+,(\d+)\]", block)
            if content_inset:
                coordinates[1] += int(content_inset.group(1))
            frames.append(coordinates)
    assert frames, "Cannot measure the native keyboard window"
    keyboard_top = min(frame[1] for frame in frames if frame[3] > frame[1])
    done = wait("Done", desc=True, seconds=10)
    toolbar = next(n for n in last_tree.iter("node") if n.get("resource-id", "").split("/")[-1] == "keyboard.toolbar")
    toolbar_bounds = list(map(int, re.findall(r"\d+", toolbar.get("bounds"))))
    assert bounds[3] <= toolbar_bounds[1], f"{label} is covered by the keyboard toolbar: {bounds}, {toolbar_bounds}"
    assert toolbar_bounds[3] <= keyboard_top + 3, f"Keyboard toolbar is below the IME: {toolbar_bounds}, {keyboard_top}"
    assert bounds[1] >= 0 and bounds[3] - bounds[1] >= 50, f"{label} is clipped"
    keyboard_checks.append({"field": label, "bounds": bounds, "keyboard_top": keyboard_top,
                            "toolbar_bounds": toolbar_bounds, "capture": capture})
    screenshot(capture)
    passed("Focused input remains above open keyboard: " + label)


def screenshot(name):
    (OUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p"))
    if last_tree is not None:
        ET.ElementTree(last_tree).write(OUT / f"{name}.xml")


def passed(message):
    checks.append(message)
    print("PASS:", message, flush=True)


def api(path, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request("http://127.0.0.1:4000" + path, headers=headers, method=method,
                                     data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


env = os.environ.copy()
env.update(NODE_ENV="test", DATABASE_PATH=str(OUT / "test.sqlite"), JWT_SECRET=secrets.token_hex(32),
           GEMINI_API_KEY="", ENABLE_NOTIFICATIONS="false", ADMIN_PHONE="9999999999",
           ADMIN_NAME="QA Admin", ADMIN_PASSWORD="Qa-Admin-2026-Only", PORT="4000")
backend = ROOT / "build-source/apps/api"
for entry in ["bootstrap", "seed"]:
    subprocess.run(["node", f"dist/{entry}.js"], cwd=backend, env=env, check=True)
log = (OUT / "api-log.txt").open("w")
server = subprocess.Popen(["node", "dist/index.js"], cwd=backend, env=env, stdout=log, stderr=log, stdin=subprocess.DEVNULL)
try:
    for attempt in range(30):
        try:
            if api("/health")["ok"]:
                break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError("Isolated backend did not start.")
    adb("install", "-r", str(ROOT / "ci-build.apk"), timeout=120)
    passed("Release APK installed")
    adb("reverse", "tcp:4000", "tcp:4000")
    adb("shell", "wm", "size", "720x1280")
    adb("shell", "wm", "density", "280")
    adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "wm", "dismiss-keyguard")
    adb("shell", "am", "start", "-n", PACKAGE + "/.MainActivity")
    wait("Connect to your mart", seconds=60)
    primary = wait("Connect & continue", desc=True)
    bounds = list(map(int, re.findall(r"\d+", primary.get("bounds"))))
    assert bounds[3] - bounds[1] >= 77, "Primary button lost its native styles and minimum touch height"
    passed("Native primary button has an accessible touch height")
    screenshot("01-connection")
    passed("Native app launches with connection screen")
    fill("https://api.yourmart.com", "http://127.0.0.1:4000", keep_keyboard=True)
    assert_input_above_keyboard("Mart service address", "keyboard-01-connection")
    dismiss_keyboard()
    click("Connect & continue")
    wait("Welcome back")
    screenshot("02-login")
    click("Sign up")
    wait("Hello, neighbour")
    fill("What should we call you", "QA Shopper", keep_keyboard=True)
    assert_input_above_keyboard("Your name", "keyboard-02-signup-name")
    click("Next", desc=True)
    assert_input_above_keyboard("Mobile number", "keyboard-03-signup-phone")
    adb("shell", "input", "text", "9876543210")
    click("Next", desc=True)
    assert_input_above_keyboard("Password", "keyboard-04-signup-password")
    adb("shell", "input", "text", "Qa-Shopper-2026-Only")
    dismiss_keyboard()
    click("Create account")
    wait("Home", desc=True)
    screenshot("03-customer-home")
    passed("Customer signup and native product grid")
    wait("Pause basket animation", desc=True)
    click("Pause basket animation", desc=True)
    wait("Play basket animation", desc=True)
    click("Play basket animation", desc=True)
    screenshot("03a-home-motion")
    passed("Home 3D animation pause and resume controls")
    click("Search rice, milk, essentials...", desc=True)
    assert_input_above_keyboard("Search rice, milk, essentials...", "keyboard-05-home-search")
    assert find("Home", desc=True) is None, "Customer navigation still consumes typing space"
    dismiss_keyboard()
    wait("Home", desc=True)
    click("Add Basmati Rice to cart", desc=True)
    click("Cart", desc=True)
    wait("Your basket")
    fill("Anything we should know?", "Please pack carefully", keep_keyboard=True)
    assert_input_above_keyboard("A note for the mart (optional)", "keyboard-06-cart-note")
    dismiss_keyboard()
    click("Place pickup order")
    wait("Order placed")
    click("View my order")
    admin = api("/api/auth/login", "POST", {"role": "admin", "phone": "9999999999", "password": env["ADMIN_PASSWORD"]})
    token = admin["accessToken"]
    orders = api("/api/admin/orders", token=token)["orders"]
    assert len(orders) == 1 and orders[0]["status"] == "placed"
    order = orders[0]
    wait(order["number"])
    screenshot("04-order-placed")
    passed("Native cart places pickup order")
    for status in ["accepted", "packed"]:
        api(f"/api/admin/orders/{order['id']}/status", "PATCH", {"status": status}, token)
    wait("Ready for pickup", seconds=45)
    passed("Packed order arrives through realtime updates with alerts disabled")
    click(order["number"])
    click("picked up my order")
    click("Yes, picked up")
    for _ in range(20):
        picked = api("/api/admin/orders?status=all", token=token)["orders"][0]
        if picked["status"] == "picked":
            break
        time.sleep(1)
    assert picked["status"] == "picked", "Native pickup confirmation did not complete"
    screenshot("05-order-picked")
    passed("Customer confirms pickup")
    click("Close", desc=True)
    click("Profile", desc=True)
    wait("Your corner")
    screenshot("06-profile")
    click("Change password")
    click("New password", desc=True)
    assert_input_above_keyboard("New password", "keyboard-07-profile-password")
    dismiss_keyboard()
    click("Close", desc=True)
    click("Log out")
    wait("Welcome back")
    click("Admin", desc=False)
    fill("10-digit mobile number", "9999999999")
    fill("At least 8 characters", env["ADMIN_PASSWORD"])
    click("Open admin workspace")
    wait("Manage Inventory")
    passed("Separate native admin login")
    admin_tab("Dashboard")
    click("Bills", desc=True)
    click("Weekly", desc=True)
    click("Previous point", desc=True)
    screenshot("16-admin-analytics-trend-phone")
    passed("Interactive admin analytics supports bill counts, weekly grouping and point inspection")
    click("By gross sales", desc=True)
    screenshot("17-admin-analytics-products-phone")
    passed("Admin top-product graph switches to gross sales")
    admin_tab("Manage Inventory")
    wait("Manage inventory", sensitive=True)
    click("Add product")
    wait("Add a product")
    click("Low-stock threshold", desc=True)
    assert_input_above_keyboard("Low-stock threshold", "keyboard-08-inventory-numeric")
    click("Next", desc=True)
    assert_input_above_keyboard("Pack size / unit", "keyboard-09-inventory-next")
    dismiss_keyboard()
    click("Close", desc=True)
    admin_tab("Customers")
    wait("Customers & team")
    click("Create account")
    click("Initial password", desc=True)
    assert_input_above_keyboard("Initial password", "keyboard-10-admin-account")
    dismiss_keyboard()
    click("Close", desc=True)
    admin_tab("Rewards & Coupons")
    wait("Rewards & coupons", sensitive=True)
    click("Create coupon")
    click("Uses per customer", desc=True)
    assert_input_above_keyboard("Uses per customer", "keyboard-11-coupon-numeric")
    dismiss_keyboard()
    click("Close", desc=True)
    admin_tab("Store Settings")
    wait("Store settings")
    click("Pickup instructions", desc=True)
    assert_input_above_keyboard("Pickup instructions", "keyboard-11-settings-multiline")
    dismiss_keyboard()
    click("Points earned per full", desc=False)
    assert_input_above_keyboard("Points earned per full ₹100 after pickup", "keyboard-12-settings-numeric")
    dismiss_keyboard()
    fill("Store name", "x", replace=True)
    click("Save store details")
    wait("Please check")
    tree = dump()
    assert not any(n.get("resource-id", "") in ["android:id/alertTitle", "android:id/button1"] for n in tree.iter("node")), "Error still uses the default Android alert"
    screenshot("14-themed-error-dialog")
    click("Okay", desc=True)
    fill("Store name", "QA Mart", replace=True)
    click("Save store details")
    wait("Store updated")
    screenshot("15-themed-success-dialog")
    click("Okay", desc=True)
    passed("Errors and confirmations use app-branded dialogs")
    admin_tab("AI Summary")
    wait("AI summary", sensitive=True)
    click("Ask anything about your mart", desc=True)
    adb("shell", "input", "text", "Show%sstock%ssummary")
    assert_input_above_keyboard("Ask anything about your mart", "keyboard-13-ai-composer")
    send = wait("Send to AI assistant", desc=True)
    send_bounds = list(map(int, re.findall(r"\d+", send.get("bounds"))))
    assert send.get("enabled") == "true" and send_bounds[3] <= keyboard_checks[-1]["toolbar_bounds"][1], "AI send action is covered"
    dismiss_keyboard()
    admin_tab("Dashboard")
    adb("shell", "wm", "size", "1600x1000")
    adb("shell", "wm", "density", "160")
    time.sleep(2)
    wait("Manage Inventory")
    screenshot("07-admin-dashboard-tablet")
    for tab, title, capture in [
        ("Manage Inventory", "Manage inventory", "08-admin-inventory"),
        ("Customers", "Customers & team", "09-admin-customers"),
        ("Sales & Invoices", "Sales & invoices", "10-admin-sales"),
        ("Rewards & Coupons", "Rewards & coupons", "11-admin-coupons"),
        ("AI Summary", "AI summary", "12-admin-ai"),
        ("Store Settings", "Store settings", "13-admin-settings"),
    ]:
        click(tab)
        wait(title, sensitive=True)
        screenshot(capture)
        passed("Native admin screen: " + title)
    reports = api("/api/admin/reports/dashboard", token=token)
    (OUT / "smoke.json").write_text(json.dumps({"passed": checks, "order": {"number": order["number"], "status": picked["status"]},
                                               "dashboard": reports, "notifications_enabled": False,
                                               "android_api": adb("shell", "getprop", "ro.build.version.sdk").decode().strip(),
                                               "keyboard_checks": keyboard_checks}, indent=2))
    print("Native Android smoke test passed.", flush=True)
except Exception:
    try:
        dump()
        screenshot("failure")
        (OUT / "keyboard-failure-window.txt").write_bytes(adb("shell", "dumpsys", "window", "windows"))
    except Exception:
        pass
    raise
finally:
    try:
        (OUT / "adb-logcat.txt").write_bytes(adb("logcat", "-d", timeout=20))
    except Exception:
        pass
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
    log.close()
