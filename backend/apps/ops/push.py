"""
Push notifications through Firebase Cloud Messaging's HTTP v1 API.

Credentials come from FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64) so no key
file lives on disk. Uses google-auth for the OAuth token instead of the much larger firebase-admin
package, which keeps serverless bundles small. Without credentials, push is skipped and the in-app
notification inbox still works.
"""
import base64
import json
import logging
import os
import threading

import requests
from django.conf import settings
from django.db import close_old_connections

logger = logging.getLogger(__name__)
FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
DEAD_TOKEN_ERRORS = {'UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'NOT_FOUND'}
_creds = None
_lock = threading.Lock()


def _credentials_dict():
    raw = (settings.FIREBASE_SERVICE_ACCOUNT or '').strip()
    if not raw:
        return None
    try:
        if not raw.startswith('{'):
            raw = base64.b64decode(raw).decode()
        data = json.loads(raw)
        return data if data.get('type') == 'service_account' else None
    except (ValueError, UnicodeDecodeError):
        logger.error('FIREBASE_SERVICE_ACCOUNT is not valid service-account JSON')
        return None


def is_configured() -> bool:
    return _credentials_dict() is not None


def _access_token() -> tuple[str, str] | None:
    """(OAuth access token, Firebase project id), refreshed when it expires."""
    global _creds
    info = _credentials_dict()
    if info is None:
        return None
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    with _lock:
        if _creds is None:
            _creds = service_account.Credentials.from_service_account_info(info, scopes=[FCM_SCOPE])
        if not _creds.valid:
            _creds.refresh(Request())
        return _creds.token, info['project_id']


def send_to_users(user_ids, title: str, body: str, data: dict | None = None, link: str = '/') -> dict:
    """Send one notification to every active device of the given users. Returns delivery counts."""
    from .models import DeviceToken

    tokens = list(DeviceToken.objects.filter(user_id__in=list(user_ids), is_active=True).values_list('token', flat=True))
    if not tokens:
        return {'sent': 0, 'failed': 0, 'skipped': 'no devices'}
    auth = _access_token() if is_configured() else None
    if auth is None:
        return {'sent': 0, 'failed': 0, 'skipped': 'push not configured'}
    access, project = auth

    payload = {k: str(v) for k, v in (data or {}).items() if v is not None}
    payload.setdefault('link', link)
    sent = failed = 0
    dead = []
    with requests.Session() as s:
        s.headers.update({'Authorization': f'Bearer {access}', 'Content-Type': 'application/json'})
        for token in tokens:
            message = {'message': {
                'token': token,
                'notification': {'title': title[:120], 'body': body[:400]},
                'data': payload,
                'webpush': {'fcm_options': {'link': link}},
                'android': {'priority': 'high'},
            }}
            try:
                r = s.post(f'https://fcm.googleapis.com/v1/projects/{project}/messages:send', json=message, timeout=10)
            except requests.RequestException as exc:
                logger.warning('FCM send failed: %s', exc)
                failed += 1
                continue
            if r.ok:
                sent += 1
                continue
            failed += 1
            try:
                details = r.json().get('error', {}).get('details', [])
                code = next((d.get('errorCode') for d in details if d.get('errorCode')), r.json().get('error', {}).get('status'))
            except ValueError:
                code = None
            if code in DEAD_TOKEN_ERRORS:
                dead.append(token)
    if dead:
        DeviceToken.objects.filter(token__in=dead).update(is_active=False, last_error='unregistered')
    return {'sent': sent, 'failed': failed}


def send_async(user_ids, title, body, data=None, link='/'):
    """Fire-and-forget on long-running servers; inline on serverless (Vercel), where background
    threads are not guaranteed to finish after the response is sent."""
    if not is_configured():
        return
    if os.getenv('VERCEL'):
        try:
            send_to_users(user_ids, title, body, data, link)
        except Exception as exc:  # a push failure must never fail the request
            logger.warning('push failed: %s', exc)
        return

    def run():
        try:
            send_to_users(user_ids, title, body, data, link)
        finally:
            close_old_connections()

    threading.Thread(target=run, daemon=True).start()


ROLE_HOME = {'customer': '/app', 'dairy': '/console', 'delivery_boy': '/route', 'admin': '/control'}
