"""Download and hash-check the APK from a completed build, without forwarding tokens."""
import hashlib
import io
import json
import os
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

api = os.environ.get("GITHUB_API_URL", "https://api.github.com")
repo = os.environ["GITHUB_REPOSITORY"]
token = os.environ["GITHUB_TOKEN"]
headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}"}


def get(path):
    with urllib.request.urlopen(urllib.request.Request(f"{api}/repos/{repo}/{path}", headers=headers), timeout=60) as response:
        return json.load(response)


run_id = os.environ.get("BUILD_RUN_ID", "").strip()
if run_id and run_id != "0":
    run = get(f"actions/runs/{int(run_id)}")
else:
    runs = get("actions/workflows/android-apk.yml/runs?status=success&branch=main&per_page=1")["workflow_runs"]
    if not runs:
        raise RuntimeError("No successful Android APK build exists.")
    run = runs[0]
if run["conclusion"] != "success":
    raise RuntimeError("Selected APK build did not succeed.")
artifacts = get(f"actions/runs/{run['id']}/artifacts")["artifacts"]
artifact = next(a for a in artifacts if a["name"] == "Aone-Mart-APK" and not a["expired"])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, response_headers, url):
        return None


request = urllib.request.Request(artifact["archive_download_url"], headers=headers)
try:
    with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
        archive = response.read()
except urllib.error.HTTPError as error:
    if error.code != 302:
        raise
    location = error.headers["Location"]
    if not location.startswith("https://"):
        raise RuntimeError("Artifact redirect must use HTTPS.")
    # The signed storage URL does not receive the GitHub token.
    with urllib.request.urlopen(location, timeout=60) as response:
        archive = response.read()
digest = artifact.get("digest")
if digest and hashlib.sha256(archive).hexdigest() != digest.removeprefix("sha256:"):
    raise RuntimeError("Artifact archive hash mismatch.")
with zipfile.ZipFile(io.BytesIO(archive)) as files:
    apk_name = next(n for n in files.namelist() if n.endswith("Aone-Mart-build.apk"))
    sum_name = next(n for n in files.namelist() if n.endswith("SHA256.txt"))
    apk = files.read(apk_name)
    expected = files.read(sum_name).decode().split()[0]
if hashlib.sha256(apk).hexdigest() != expected:
    raise RuntimeError("APK hash mismatch.")
Path("ci-build.apk").write_bytes(apk)
with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    output.write(f"source_sha={run['head_sha']}\nrun_id={run['id']}\n")
print(f"Verified APK from build {run['id']}, source {run['head_sha']}; {len(apk)} bytes.")
