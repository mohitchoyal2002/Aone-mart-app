"""Exercise the compiled native APK against an isolated API and sample catalog."""
import json
import datetime
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
    # During a splash/activity transition Android can briefly return an empty
    # hierarchy or a non-XML dump. Retry the capture, preserving UI assertions.
    for attempt in range(4):
        adb("shell", "uiautomator", "dump", "/sdcard/aone-ui.xml")
        data = adb("exec-out", "cat", "/sdcard/aone-ui.xml")
        (OUT / "last-ui.xml").write_bytes(data)
        try:
            tree = ET.fromstring(data)
            assert tree.tag == "hierarchy", "Unexpected native hierarchy"
            last_tree = tree
            return tree
        except (ET.ParseError, AssertionError):
            if attempt == 3:
                raise
            time.sleep(.5)


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


def scroll(direction=1):
    size = adb("shell", "wm", "size").decode()
    width, height = map(int, re.findall(r"(\d+)x(\d+)", size)[-1])
    start, end = (height * 4 // 5, height // 4) if direction == 1 else (height // 4, height * 4 // 5)
    adb("shell", "input", "swipe", str(width // 2), str(start), str(width // 2), str(end), "400")
    time.sleep(.6)


def click(label, desc=False, exact=False):
    node = None
    for _ in range(5):
        node = find(label, desc=desc, exact=exact)
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
    # Populated inputs expose their label as content-desc rather than their
    # current text. The settings form may still be scrolled to its last field.
    if replace:
        for _ in range(8):
            if find(placeholder, desc=True) is not None:
                break
            scroll(direction=-1)
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
    # React Native reads transition_animation_scale for Reduce Motion.
    # Emulator-runner disables all three scales; restore real native motion.
    for setting in ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]:
        adb("shell", "settings", "put", "global", setting, "1")
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
    # The initial home is a lightweight poster. No native GPU work starts
    # until the customer explicitly presses Play.
    native_log = adb("logcat", "-d", "-s", "ReactNativeJS").decode(errors="replace")
    assert "Aone Mart basket scene rendered" not in native_log, "3D was initialized automatically at startup"
    click("Play basket animation", desc=True)
    wait("Pause basket animation", desc=True)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        native_log = adb("logcat", "-d", "-s", "ReactNativeJS").decode(errors="replace")
        if "Aone Mart basket scene rendered (Three.js + Anime.js)" in native_log:
            break
        time.sleep(1)
    assert "Aone Mart basket scene rendered (Three.js + Anime.js)" in native_log, "The native 3D scene did not render any meshes"
    passed("Startup keeps native 3D idle until Play")
    click("Pause basket animation", desc=True)
    wait("Play basket animation", desc=True)
    click("Play basket animation", desc=True)
    time.sleep(1)
    screenshot("03a-home-motion")
    native_log = adb("logcat", "-d", "-s", "ReactNativeJS").decode(errors="replace")
    assert "Aone Mart basket scene rendered (Three.js + Anime.js)" in native_log, "The native 3D scene did not render any meshes"
    assert "Aone Mart basket initialization failed" not in native_log and "Aone Mart basket rendering failed" not in native_log, "The native 3D scene fell back after a rendering error"
    passed("Native Three.js scene renders meshes with Anime.js object animation")
    passed("Home 3D animation pause and resume controls")
    adb("shell", "settings", "put", "global", "transition_animation_scale", "0")
    adb("shell", "settings", "put", "global", "animator_duration_scale", "0")
    time.sleep(1)
    assert find("Pause basket animation", desc=True) is None, "Reduce Motion did not disable automatic animation"
    screenshot("03b-home-reduced-motion")
    adb("shell", "settings", "put", "global", "transition_animation_scale", "1")
    adb("shell", "settings", "put", "global", "animator_duration_scale", "1")
    wait("Pause basket animation", desc=True)
    passed("Home respects Android Reduce Motion")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-n", PACKAGE + "/.MainActivity")
    screenshot("03c-cold-start")
    wait("Home", desc=True, seconds=60)
    screenshot("03d-restored-home")
    passed("Cold startup restores the customer session without a recovery error")
    # Scroll to the bundled film, exercise native player teardown and leave
    # the screen. The web preview cannot validate native player lifetime.
    for _ in range(14):
        if find("Play market video", desc=True) is not None:
            break
        scroll()
    click("Play market video", desc=True)
    wait("Pause market video", desc=True)
    click("Pause market video", desc=True)
    wait("Play market video", desc=True)
    click("Play market video", desc=True)
    time.sleep(2)
    wait("Pause market video", desc=True)
    screenshot("03e-native-market-video")
    click("Cart", exact=True)
    wait("Your basket")
    click("Home", desc=True)
    wait("Home", desc=True)
    for _ in range(14):
        if find("Search rice, milk, essentials...", desc=True) is not None:
            break
        scroll(direction=-1)
    native_log = adb("logcat", "-d", "-s", "ReactNativeJS").decode(errors="replace")
    assert "Aone Mart render failed" not in native_log, "Native video play/pause or screen teardown triggered recovery"
    passed("Bundled native video plays, pauses and survives screen changes")
    click("Search rice, milk, essentials...", desc=True)
    assert_input_above_keyboard("Search rice, milk, essentials...", "keyboard-05-home-search")
    assert find("Home", desc=True) is None, "Customer navigation still consumes typing space"
    dismiss_keyboard()
    wait("Home", desc=True)
    click("View Basmati Rice", desc=True)
    wait("Product details")
    wait("A verified product photo is not available yet")
    assert find("Home", desc=True) is None, "Product details is still inside the tab grid"
    screenshot("03f-product-details")
    click("Add to basket", desc=True)
    wait("View basket, 1 items", desc=True)
    click("Back to products", desc=True)
    wait("Home", desc=True)
    passed("Image-free imported product opens a full page and adds to the shared cart")
    # Cart announces its item count once populated, while its visible label
    # stays Cart. Text lookup matches both the empty and populated tab.
    click("Cart", exact=True)
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
    admin_tab("Sales & Invoices")
    wait("Sales & invoices", sensitive=True)
    before_stock = api("/api/admin/reports/inventory", token=token)["stats"]["units"]
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)).date().isoformat()
    csv_path = OUT / "aone-qa-sales.csv"
    csv_path.write_text(f"Bill No.,Customer,Received Amount,Credit Amount,Cheque Amount,Card Amount,Net Amount,RefDate\nQA-NATIVE-SUMMARY,Counter shopper,100,0,0,0,100,{today}\n")
    adb("push", str(csv_path), "/sdcard/Download/aone-qa-sales.csv")
    click("Import invoices", desc=True)
    wait("Show roots", desc=True)
    click("Show roots", desc=True)
    click("Downloads")
    click("aone-qa-sales.csv", exact=True)
    wait("Review your import")
    assert find("Deduct stock for these sales?") is None, "Bill summaries must not offer invented stock deductions"
    screenshot("18-native-csv-preview")
    for _ in range(6):
        if find("I reviewed this file") is not None:
            break
        scroll()
    tree = dump()
    review_switch = next(n for n in tree.iter("node") if n.get("class", "").endswith("Switch") and n.get("enabled") == "true")
    left, top, right, bottom = map(int, re.findall(r"\d+", review_switch.get("bounds")))
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
    click("Confirm import", desc=True)
    wait("Import complete")
    screenshot("19-native-csv-success")
    click("Okay", desc=True)
    assert api("/api/admin/reports/inventory", token=token)["stats"]["units"] == before_stock
    report = api("/api/admin/reports/sales", token=token)
    assert report["stats"]["summaryInvoices"] == 1 and report["stats"]["summaryRevenue"] == 10000
    passed("Native CSV picker previews and imports bill summaries without changing stock")
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
    banner_asset = ROOT / "build-source/apps/mobile/assets/brand/mark.png"
    adb("push", str(banner_asset), "/sdcard/Download/aone-qa-banner.png")
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file:///sdcard/Download/aone-qa-banner.png")
    for count in [0, 1]:
        click(f"Add banner · {count}/5", desc=True)
        # SDK 57 uses the Android photo picker, with DocumentsUI as the
        # fallback on Android versions that have no installed photo picker.
        if find("Show roots", desc=True) is not None:
            click("Show roots", desc=True)
            # The current folder heading can also say Downloads. Select the
            # drawer item, not the heading behind the open drawer.
            tree = dump()
            roots = tree.find(".//node[@resource-id='com.android.documentsui:id/roots_list']")
            assert roots is not None, "DocumentsUI roots drawer is not open"
            downloads = next((n for n in roots.iter("node") if n.get("text") == "Downloads"), None)
            assert downloads is not None, "DocumentsUI Downloads root is missing"
            left, top, right, bottom = map(int, re.findall(r"\d+", downloads.get("bounds")))
            adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            time.sleep(.6)
            # Grid cells expose filename, size and time in one description.
            click("aone-qa-banner.png")
        else:
            deadline = time.monotonic() + 30
            photo = None
            while time.monotonic() < deadline:
                tree = dump()
                # The Android 16 Compose picker exposes photo descriptions on
                # non-clickable child nodes; their bounds remain tappable.
                photo = next((n for n in tree.iter("node") if
                              ("photo taken" in n.get("content-desc", "").casefold()
                                   or "aone-qa-banner" in (n.get("text", "") + n.get("content-desc", "")))), None)
                if photo is not None:
                    break
                time.sleep(1)
            assert photo is not None, "Native photo picker did not show the seeded banner image"
            left, top, right, bottom = map(int, re.findall(r"\d+", photo.get("bounds")))
            adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
        wait("Add a banner")
        fill("Banner title", f"Native offer {count + 1}")
        fill("Describe the offer or image", "Neighbourhood essentials")
        click("Save banner", desc=True)
        wait("Banner saved")
        screenshot(f"20-native-banner-upload-{count + 1}")
        click("Okay", desc=True)
        saved_banners = api("/api/admin/settings/banners", token=token)["banners"]
        assert len(saved_banners) == count + 1
    passed("Native image picker compresses and uploads multiple store banners")
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
