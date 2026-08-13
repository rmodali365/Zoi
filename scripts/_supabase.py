"""Shared helpers for the Supabase admin scripts.

Deliberately stdlib-only so these run with no install step.

Two hard-won details are encoded here rather than left to be rediscovered:

  * The Management API payload is built with json.dumps. Raw newlines inside the
    JSON string fail *silently* — the API returns [] and nothing is applied.
  * The request goes out through curl, not urllib. Cloudflare 403s urllib on
    api.supabase.com. (The PostgREST endpoints on <ref>.supabase.co are fine
    with urllib, which is why verify-schema.py uses it there.)
"""

import json
import os
import subprocess
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS = os.path.join(REPO, '.claude', 'settings.local.json')
EAS = os.path.join(REPO, 'eas.json')

# Keep these in step with docs/deployment.md.
PROJECTS = {
    'dev': 'ckfpzzddogzdbjtxmahq',
    'prod': 'bpwkbfffbplxyzxpkwva',
}


def resolve_ref(name_or_ref: str) -> str:
    """Accept 'dev'/'prod' or a raw project ref."""
    return PROJECTS.get(name_or_ref, name_or_ref)


def label_for(ref: str) -> str:
    for name, r in PROJECTS.items():
        if r == ref:
            return name
    return ref


def access_token() -> str:
    """Management API token, from the gitignored local settings."""
    with open(SETTINGS) as f:
        return json.load(f)['mcpServers']['supabase']['args'][3]


def anon_key(ref: str):
    """The anon key for a project, read out of eas.json's build profiles.

    Returns (url, key) or (None, None) when no profile targets that ref.
    """
    with open(EAS) as f:
        eas = json.load(f)
    for profile in eas.get('build', {}).values():
        env = profile.get('env') or {}
        url = env.get('EXPO_PUBLIC_SUPABASE_URL', '')
        if ref in url:
            return url, env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY')
    return None, None


def run_sql(ref: str, sql: str):
    """Execute SQL via the Management API. Returns parsed JSON.

    A list is rows (DDL returns []); a dict with 'message' is an error.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump({'query': sql}, f)
        payload = f.name
    try:
        out = subprocess.run(
            [
                'curl', '-s', '-X', 'POST',
                f'https://api.supabase.com/v1/projects/{ref}/database/query',
                '-H', f'Authorization: Bearer {access_token()}',
                '-H', 'Content-Type: application/json',
                '--data', f'@{payload}',
            ],
            capture_output=True, text=True, timeout=120,
        ).stdout
    finally:
        os.unlink(payload)

    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {'message': f'unparseable response: {out[:300]}'}


def die(msg: str):
    raise SystemExit(f'ERROR: {msg}')
