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


def fill(placeholder, value):
    click(placeholder)
    adb("shell", "input", "text", value.replace(" ", "%s"))
    ime = adb("shell", "dumpsys", "input_method").decode(errors="replace")
    if "mInputShown=true" in ime or "isInputViewShown=true" in ime:
        adb("shell", "input", "keyevent", "4")
    time.sleep(.5)


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
    fill("https://api.yourmart.com", "http://127.0.0.1:4000")
    click("Connect & continue")
    wait("Welcome back")
    screenshot("02-login")
    click("Sign up")
    wait("Hello, neighbour")
    fill("What should we call you", "QA Shopper")
    fill("10-digit mobile number", "9876543210")
    fill("At least 8 characters", "Qa-Shopper-2026-Only")
    click("Create account")
    wait("Home", desc=True)
    screenshot("03-customer-home")
    passed("Customer signup and native product grid")
    click("Add Basmati Rice to cart", desc=True)
    click("Cart", desc=True)
    wait("Your basket")
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
    click("Log out")
    wait("Welcome back")
    click("Admin", desc=False)
    fill("10-digit mobile number", "9999999999")
    fill("At least 8 characters", env["ADMIN_PASSWORD"])
    click("Open admin workspace")
    wait("Manage Inventory")
    passed("Separate native admin login")
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
                                               "dashboard": reports, "notifications_enabled": False}, indent=2))
    print("Native Android smoke test passed.", flush=True)
except Exception:
    try:
        dump()
        screenshot("failure")
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
