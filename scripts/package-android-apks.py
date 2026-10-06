"""Ship ARM64 only; preserve the compiled app payload and certificate for QA.

Expo's generated project signs preview releases with its development keystore.
The phone APK uses that same key and byte-identical JS, resources and ARM64
libraries. The original universal APK is retained for the x86 emulator tests.
"""
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

source, tools, keystore = map(Path, sys.argv[1:])
phone_dir = Path("apk-output")
emulator_dir = Path("apk-emulator-output")
phone_dir.mkdir(exist_ok=True)
emulator_dir.mkdir(exist_ok=True)
phone = phone_dir / "Aone-Mart-build.apk"
emulator = emulator_dir / phone.name
shutil.copy2(source, emulator)


def signature(path):
    result = subprocess.check_output([str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(path)], text=True)
    digest = re.search(r"Signer #1 certificate SHA-256 digest: (\w+)", result)
    if not digest:
        raise RuntimeError("APK certificate was not verified.")
    return digest.group(1)


def is_signature(name):
    return name == "META-INF/MANIFEST.MF" or bool(re.fullmatch(r"META-INF/[^/]+\.(SF|RSA|DSA|EC)", name))


original_certificate = signature(source)
with tempfile.TemporaryDirectory() as scratch:
    unsigned = Path(scratch) / "phone-unsigned.apk"
    aligned = Path(scratch) / "phone-aligned.apk"
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(unsigned, "w") as output:
        for entry in original.infolist():
            if is_signature(entry.filename) or (entry.filename.startswith("lib/") and not entry.filename.startswith("lib/arm64-v8a/")):
                continue
            output.writestr(entry, original.read(entry))
    subprocess.run([str(tools / "zipalign"), "-P", "16", "-f", "4", str(unsigned), str(aligned)], check=True)
    subprocess.run([str(tools / "apksigner"), "sign", "--ks", str(keystore), "--ks-key-alias", "androiddebugkey", "--ks-pass", "pass:android", "--key-pass", "pass:android", "--out", str(phone), str(aligned)], check=True)
    subprocess.run([str(tools / "zipalign"), "-c", "-P", "16", "4", str(phone)], check=True)

if signature(phone) != original_certificate:
    raise RuntimeError("Phone APK certificate differs from the tested APK.")
with zipfile.ZipFile(phone) as shipped, zipfile.ZipFile(emulator) as tested:
    names = set(shipped.namelist())
    libraries = [n for n in names if n.startswith("lib/") and n.endswith(".so")]
    if not libraries or any(not n.startswith("lib/arm64-v8a/") for n in libraries):
        raise RuntimeError("The phone APK must contain only ARM64 libraries.")
    expected = {n for n in tested.namelist() if not is_signature(n) and (not n.startswith("lib/") or n.startswith("lib/arm64-v8a/"))}
    if {n for n in names if not is_signature(n)} != expected:
        raise RuntimeError("Phone APK is missing part of the compiled app.")
    for name in expected:
        if shipped.read(name) != tested.read(name):
            raise RuntimeError(f"Phone and emulator application payload differs: {name}")
for path in [phone, emulator]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (path.parent / "SHA256.txt").write_text(f"{digest}  {path.name}\n")
print(f"Verified matching application payload and certificate. Phone: {phone.stat().st_size:,} bytes; emulator: {emulator.stat().st_size:,} bytes.")
