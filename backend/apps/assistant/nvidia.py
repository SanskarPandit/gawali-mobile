"""
Client for NVIDIA NIM hosted models (build.nvidia.com), one model per job:

    chat     customer support assistant          (MiniMax M3.1 Flash)
    vision   refund photo verification            (Nemotron 3.5 Super VL)
    insight  dairy insights, recs, route briefs   (Nemotron 3.5 Lightning)
    parse    lab-report document parsing          (Nemotron Parse)

Reasoning ("thinking") is switched off: it costs 5–10 s per call and these jobs need direct
answers inside a few seconds. If the primary key is rate-limited or erroring, the alternate
key is tried once. Every call returns None on failure so callers fall back to rules, and every
call is logged as an AIInteraction so human decisions can later label it as training data.
"""
import json
import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

THINK_RE = re.compile(r'<think>.*?</think>', re.S | re.I)
RETRY_STATUSES = {429, 500, 502, 503, 504}


def is_configured() -> bool:
    return bool(settings.NVIDIA_API_KEY)


def model_for(task: str) -> str:
    return settings.NVIDIA_MODELS.get(task) or settings.NVIDIA_MODELS['chat']


def engine_label(task: str = 'chat') -> str:
    return model_for(task) if is_configured() else 'rules'


def _keys() -> list[str]:
    return [k for k in (settings.NVIDIA_API_KEY, getattr(settings, 'NVIDIA_API_KEY_ALT', '')) if k]


def _post(payload: dict, timeout: float) -> tuple[dict | None, str]:
    """POST to chat/completions, failing over to the alternate key on throttling or server errors."""
    last = 'no key'
    for key in _keys():
        try:
            resp = requests.post(
                f'{settings.NVIDIA_BASE_URL}/chat/completions',
                headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
                json=payload, timeout=timeout,
            )
        except requests.Timeout as exc:
            # A slow queue is slow for every key; retrying would only double the wait.
            last = f'timeout: {exc}'
            break
        except requests.RequestException as exc:
            last = f'network: {exc}'
            continue
        if resp.status_code == 200:
            try:
                return resp.json(), ''
            except ValueError:
                return None, 'invalid JSON from model'
        last = f'HTTP {resp.status_code}: {resp.text[:200]}'
        if resp.status_code not in RETRY_STATUSES:
            break
    return None, last


def _log(task, model, messages, output, ms, error, context):
    try:
        from .models import AIInteraction

        # Images are stored as a marker, not base64, to keep the dataset small.
        safe = json.loads(json.dumps(messages, default=str))
        for m in safe:
            if isinstance(m.get('content'), list):
                m['content'] = [c if c.get('type') == 'text' else {'type': c.get('type'), 'omitted': True} for c in m['content']]
            elif isinstance(m.get('content'), str) and 'base64,' in m['content']:
                m['content'] = '<image omitted>'
        AIInteraction.objects.create(task=task, model=model, prompt=safe, output=output or '',
                                            latency_ms=ms, error=error[:500], context=context or {})
    except Exception as exc:  # logging must never break the feature
        logger.debug('AI log skipped: %s', exc)


def chat(messages: list[dict], *, task: str = 'chat', temperature: float = 0.3, max_tokens: int = 700,
         context: dict | None = None, extra: dict | None = None, timeout: float | None = None) -> str | None:
    if not is_configured():
        return None
    model = model_for(task)
    payload = {
        'model': model, 'messages': messages, 'temperature': temperature, 'top_p': 0.9,
        'max_tokens': max_tokens, 'stream': False,
        'chat_template_kwargs': {'enable_thinking': False},
        **(extra or {}),
    }
    started = time.monotonic()
    data, error = _post(payload, timeout or settings.NVIDIA_TIMEOUT_SECONDS)
    ms = int((time.monotonic() - started) * 1000)
    text = None
    if data:
        try:
            msg = data['choices'][0]['message']
            text = THINK_RE.sub('', msg.get('content') or '').strip()
            if not text and msg.get('tool_calls'):
                text = msg['tool_calls'][0]['function'].get('arguments') or ''
        except (KeyError, IndexError, TypeError):
            error = 'unexpected response shape'
    if error:
        logger.warning('NVIDIA %s (%s) failed: %s', task, model, error)
    else:
        logger.info('NVIDIA %s (%s) answered in %d ms', task, model, ms)
    _log(task, model, messages, text, ms, error, context)
    return text or None


def extract_json(text: str | None):
    """Pull the first JSON object or array out of a model reply (handles ```json fences and chatter)."""
    if not text:
        return None
    fenced = re.search(r'```(?:json)?\s*(.+?)```', text, re.S)
    if fenced:
        text = fenced.group(1)
    for opener, closer in (('{', '}'), ('[', ']')):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except ValueError:
                continue
    return None


def chat_json(messages: list[dict], **kwargs):
    return extract_json(chat(messages, **kwargs))


def parse_document(image_b64: str, mime: str = 'image/png', context: dict | None = None) -> str | None:
    """OCR a document image to markdown text with Nemotron Parse."""
    text = chat(
        [{'role': 'user', 'content': f'<img src="data:{mime};base64,{image_b64}" />'}],
        task='parse', temperature=0, max_tokens=2000, context=context, timeout=60,
        extra={'tools': [{'type': 'function', 'function': {'name': 'markdown_no_bbox'}}],
               'chat_template_kwargs': {}},
    )
    if not text:
        return None
    try:  # the tool returns [{"text": "..."}]
        parts = json.loads(text)
        if isinstance(parts, list):
            text = '\n'.join(p.get('text', '') for p in parts if isinstance(p, dict))
    except ValueError:
        pass
    return re.sub(r'<br\s*/?>', '\n', text).strip()
