"""
AI features. Each one asks an NVIDIA model first and falls back to deterministic rules,
returning the same shape either way plus an `engine` label so the UI can show its source.
"""
import base64
import json
import re
import threading
from datetime import date, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import close_old_connections
from django.utils import timezone

from . import nvidia

IMAGE_SIGNATURES = (b'\xff\xd8\xff', b'\x89PNG', b'RIFF', b'GIF8')
MIN_PHOTO_BYTES = 6 * 1024


def _json_default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, date):
        return o.isoformat()
    return str(o)


def dumps(data) -> str:
    return json.dumps(data, default=_json_default, ensure_ascii=False)


# --- Background refresh ------------------------------------------------------------------
#
# Free hosted models usually answer in ~1 s but occasionally take 15–20 s. Pages must never wait on
# that, so these features answer instantly from rules (or the cached AI answer) and refresh the AI
# answer in a background thread; the UI re-asks a few seconds later while `pending` is true.

def _refresh_in_background(cache_key: str, compute, ttl: int) -> bool:
    """Start one background computation per key. Returns True if one is running."""
    if not nvidia.is_configured():
        return False
    if not cache.add(f'{cache_key}:lock', 1, 60):
        return True  # already running

    def run():
        try:
            result = compute()
            if result is not None:
                cache.set(cache_key, result, ttl)
        except Exception:  # never let a background refresh crash the worker
            pass
        finally:
            cache.delete(f'{cache_key}:lock')
            close_old_connections()

    threading.Thread(target=run, daemon=True).start()
    return True


# --- Shop recommendations ------------------------------------------------------------

REC_FALLBACK = {
    'curd': 'Set fresh from the same morning milk — pairs with your daily order',
    'paneer': 'Soft malai paneer, made in small batches every morning',
    'ghee': 'Slow-cooked bilona ghee from the milk you already trust',
    'bakery': 'Arrives warm with your milk — no second delivery needed',
    'eggs': 'Farm eggs delivered in the same 6 AM slot',
    'milk': 'A richer variant households like yours often add on weekends',
    'other': 'A daily essential that rides along with your milk',
}


def recommendation_reasons(customer_key: str, profile: dict, candidates: list[dict]) -> tuple[dict, str, bool]:
    """One short, specific reason per recommended product: (reasons, engine, pending)."""
    rules = {c['id']: REC_FALLBACK.get(c['category'], REC_FALLBACK['other']) for c in candidates}
    if not candidates:
        return {}, 'rules', False
    cache_key = f"recs:{customer_key}:{','.join(c['id'] for c in candidates)}"
    cached = cache.get(cache_key)
    if cached:
        return {**rules, **cached}, nvidia.engine_label('insight'), False

    def compute():
        reply = nvidia.chat_json([
            {'role': 'system', 'content': (
                'You write product recommendation blurbs for Gawali, a premium Indian daily-milk subscription app. '
                'Tone: warm, calm, specific, never pushy, no exclamation marks, no emojis. Max 14 words each. '
                'Only mention products the customer actually has when you reference their order.'
            )},
            {'role': 'user', 'content': (
                f'Customer context: {dumps(profile)}\nCandidate products: {dumps(candidates)}\n'
                'Return ONLY a JSON object mapping each product id to its one-line reason.'
            )},
        ], task='insight', temperature=0.5, max_tokens=500, timeout=20,
            context={'feature': 'recommendations', 'customer': customer_key})
        if isinstance(reply, dict):
            return {k: str(v)[:120] for k, v in reply.items() if k in rules} or None
        return None

    pending = _refresh_in_background(cache_key, compute, 6 * 3600)
    return rules, 'rules', pending


# --- Dairy owner insights --------------------------------------------------------------

INSIGHT_GLOSSARY = (
    'Field meanings: active_households = households with an active plan; new_this_month = households that joined '
    'this month; tomorrow_litres = litres of milk scheduled for tomorrow; tomorrow_revenue = rupees (₹) of '
    'tomorrow\'s orders; demand_change_pct = change in the LITRES of milk scheduled for tomorrow vs the 7-day average, in percent (volume, not revenue); month_collected and '
    'month_refunded = rupees (₹) this month; low_balance_customers = households whose account balance covers less '
    'than two days of their plan or who owe the dairy (a payment/billing matter, NOT stock); open_refunds = photo '
    'refund claims waiting for the owner to review; bottles_outstanding = empty glass bottles still at customers\' '
    'homes; deposits_held = rupees (₹) of refundable bottle deposits; skips_tomorrow = households pausing tomorrow; '
    'partners_active = delivery partners on the team (not new hires). Money is always ₹, never litres.'
)


def dairy_insights(dairy_id: str, kpis: dict) -> dict:
    cache_key = f'insights:{dairy_id}:{timezone.localdate()}:{hash(dumps(kpis)) % 10**8}'
    cached = cache.get(cache_key)
    if cached:
        return {'engine': nvidia.engine_label('insight'), 'items': cached, 'pending': False}

    def compute():
        reply = nvidia.chat_json([
            {'role': 'system', 'content': (
                'You are an operations analyst for an Indian dairy (a "gawali") that runs a daily milk subscription. '
                'Write crisp, actionable insights from the numbers you are given. Never invent numbers or facts '
                'that are not in the data. ' + INSIGHT_GLOSSARY
            )},
            {'role': 'user', 'content': (
                f'Today\'s business data: {dumps(kpis)}\n'
                'Return ONLY a JSON array of 3 or 4 objects: '
                '{"title": "<max 6 words>", "body": "<one or two sentences, max 35 words>", '
                '"tone": "positive" | "warning" | "neutral"}'
            )},
        ], task='insight', temperature=0.3, max_tokens=700, timeout=25,
            context={'feature': 'dairy_insights', 'dairy': dairy_id})
        if isinstance(reply, list):
            return [
                {'title': str(i.get('title', ''))[:60], 'body': str(i.get('body', ''))[:260],
                 'tone': i.get('tone') if i.get('tone') in ('positive', 'warning', 'neutral') else 'neutral'}
                for i in reply if isinstance(i, dict) and i.get('title')
            ][:4] or None
        return None

    pending = _refresh_in_background(cache_key, compute, 30 * 60)
    return {'engine': 'rules', 'items': _rule_insights(kpis), 'pending': pending}


def _rule_insights(k: dict) -> list[dict]:
    out = []
    demand = k.get('tomorrow_litres', 0)
    trend = k.get('demand_change_pct')
    if trend is not None:
        out.append({
            'title': 'Tomorrow\'s milk demand',
            'body': f"Plan for {demand:.1f} L tomorrow, {abs(trend):.0f}% {'above' if trend >= 0 else 'below'} the 7-day average. "
                    f"Top line: {k.get('top_product') or 'n/a'}.",
            'tone': 'positive' if trend >= 0 else 'neutral',
        })
    if k.get('low_balance_customers'):
        out.append({
            'title': 'Balances to follow up',
            'body': f"{k['low_balance_customers']} households owe you or have under two days of balance left. "
                    'A friendly reminder tonight keeps collections on track.',
            'tone': 'warning',
        })
    if k.get('open_refunds'):
        out.append({
            'title': 'Refund claims need review',
            'body': f"{k['open_refunds']} photo claims were flagged for a human look. Clearing them keeps the 5-second promise credible.",
            'tone': 'warning',
        })
    if k.get('bottles_outstanding'):
        out.append({
            'title': 'Glass bottles in circulation',
            'body': f"{k['bottles_outstanding']} bottles are with customers (₹{k.get('deposits_held', 0):.0f} in deposits). "
                    'Ask partners to prompt pickups on routes with the most.',
            'tone': 'neutral',
        })
    if k.get('skips_tomorrow'):
        out.append({
            'title': 'Skips and vacations',
            'body': f"{k['skips_tomorrow']} households paused tomorrow. Reduce the morning dispatch accordingly.",
            'tone': 'neutral',
        })
    return out[:4] or [{'title': 'All steady', 'body': 'No anomalies in today\'s numbers.', 'tone': 'positive'}]


# --- Delivery partner route briefing -------------------------------------------------------

def _rule_brief(summary: dict) -> str:
    lines = [f"• {summary.get('stops', 0)} stops, {summary.get('litres', 0):.1f} L to load."]
    if summary.get('express'):
        lines.append(f"• {summary['express']} express orders — deliver these first.")
    if summary.get('silent'):
        lines.append(f"• {summary['silent']} homes want silent delivery — never ring the bell there.")
    if summary.get('gate_passes'):
        lines.append(f"• {summary['gate_passes']} societies need the gate token shown on the stop card.")
    if summary.get('bottles_to_collect'):
        lines.append(f"• Collect up to {summary['bottles_to_collect']} empty glass bottles from doorsteps.")
    return '\n'.join(lines)


def route_brief(partner_key: str, summary: dict) -> dict:
    cache_key = f'brief:{partner_key}:{hash(dumps(summary)) % 10**8}'
    cached = cache.get(cache_key)
    if cached:
        return {'engine': nvidia.engine_label('insight'), 'text': cached, 'pending': False}

    def compute():
        return nvidia.chat([
            {'role': 'system', 'content': (
                'You brief an Indian milk delivery partner before the 5 AM route. Plain, friendly English that is easy '
                'to read on a phone. 3 to 5 short bullet points starting with "• ". No headings. Skip any item whose '
                'count is zero. Field meanings: litres = milk to load at the hub; silent = homes where the doorbell '
                'must not be rung; gate_passes = societies where security needs the token shown on the stop card; '
                'bottles_to_collect = empty glass bottles to pick up from customers\' doorsteps during the route; '
                'express = 15-minute orders to deliver first. At silent homes the bell must NEVER be rung, not even '
                'if nobody answers.'
            )},
            {'role': 'user', 'content': f'Route data: {dumps(summary)}'},
        ], task='insight', temperature=0.3, max_tokens=300, timeout=20,
            context={'feature': 'route_brief', 'partner': partner_key})

    pending = _refresh_in_background(cache_key, compute, 15 * 60)
    return {'engine': 'rules', 'text': _rule_brief(summary), 'pending': pending}


# --- Vision AI refund verification -------------------------------------------------------

ISSUE_PROMPTS = {
    'leaked': 'a leaked, torn, punctured or broken-seal milk pouch or bottle, or milk spilled from its packaging',
    'curdled': 'milk that has curdled or split, e.g. grainy lumps, whey separation or clumps, usually in a pan or vessel',
}


VISION_GUIDE = """You are the quality inspector for an Indian doorstep milk service. Customers photograph milk
that arrived damaged. Judge only what is visible. Be fair: phone photos are often dim, close-up or taken in a kitchen.

Counts as LEAKED / BROKEN SEAL: a punctured, torn or split plastic pouch; milk pooled under or around a pouch or bottle;
a cracked glass bottle; a lifted, missing or broken cap or foil seal; a wet, milk-soaked delivery bag.
Counts as CURDLED: milk in a pan, vessel or cup showing white lumps, grainy texture, thin yellowish whey separated
from solids, or a broken, cottage-cheese-like surface (often while or after boiling).
Does NOT count: an intact, dry, sealed pouch or bottle; smooth uniform milk; photos unrelated to milk (people,
screenshots, documents, scenery); obviously staged or downloaded stock images.

Worked examples:
- Pouch on a doormat with a wet patch and a split along the seam -> {"matches": true, "confidence": 0.9}
- Steel pan with white clumps floating in watery liquid, issue curdled -> {"matches": true, "confidence": 0.85}
- Clean sealed pouch on a counter, nothing spilled -> {"matches": false, "confidence": 0.8}
- Blurry dark photo where nothing can be made out -> {"matches": false, "confidence": 0.3}
"""


def verify_refund_photo(photo_bytes: bytes, mime: str, issue: str, delivery_id: str = '') -> dict:
    if len(photo_bytes) < MIN_PHOTO_BYTES or not photo_bytes.startswith(IMAGE_SIGNATURES):
        return {'verdict': 'unclear', 'confidence': 0.0, 'engine': 'rules',
                'observation': 'The photo could not be read. Please retake it in good light.'}

    if nvidia.is_configured() and len(photo_bytes) < 1_500_000:
        data_url = f"data:{mime or 'image/jpeg'};base64,{base64.b64encode(photo_bytes).decode()}"
        reply = nvidia.chat_json([
            {'role': 'system', 'content': VISION_GUIDE},
            {'role': 'user', 'content': [
                {'type': 'text', 'text': (
                    f'The customer reports: {ISSUE_PROMPTS.get(issue, issue)}. Does this photo plausibly show that problem? '
                    'Respond ONLY with JSON: {"matches": true|false, "confidence": <0..1>, "observation": "<one short sentence>"}'
                )},
                {'type': 'image_url', 'image_url': {'url': data_url}},
            ]},
        ], task='vision', temperature=0.1, max_tokens=220, timeout=6,
            context={'feature': 'refund_photo', 'issue': issue, 'delivery_id': delivery_id})
        if isinstance(reply, dict) and 'matches' in reply:
            try:
                conf = max(0.0, min(1.0, float(reply.get('confidence', 0.6))))
            except (TypeError, ValueError):
                conf = 0.6
            matches = reply.get('matches') in (True, 'true', 'yes')
            return {
                'verdict': 'verified' if matches and conf >= 0.45 else ('mismatch' if not matches else 'unclear'),
                'confidence': conf,
                'observation': str(reply.get('observation', ''))[:240],
                'engine': nvidia.engine_label('vision'),
            }

    if nvidia.is_configured():
        # The model was supposed to look but could not (timeout / outage): never pay out unseen.
        return {'verdict': 'unclear', 'confidence': 0.0, 'engine': 'rules', 'ai_unavailable': True,
                'observation': 'Automatic photo check was unavailable, so your dairy will review this claim shortly.'}
    # Offline mode (no AI key configured): a real, readable photo of a same-day delivery is credited.
    return {'verdict': 'verified', 'confidence': 0.8, 'engine': 'rules',
            'observation': 'Photo validated (format, size and freshness checks passed).'}


def label_refund_decision(delivery_id: str, approved: bool, note: str = '') -> None:
    """A dairy's review of a flagged claim is ground truth for the vision call that flagged it."""
    from .models import AIInteraction

    rec = AIInteraction.objects.filter(task='vision', context__delivery_id=delivery_id).order_by('-created_at').first()
    if rec:
        rec.label = AIInteraction.Label.WRONG if approved else AIInteraction.Label.CORRECT
        rec.label_note = (note or ('dairy approved a flagged claim' if approved else 'dairy rejected the claim'))[:255]
        rec.save(update_fields=['label', 'label_note', 'updated_at'])


# --- Lab report parsing (Quality lab) -------------------------------------------------------

LAB_FIELDS = {
    'fat_percent': r'\bfat\b',
    'snf_percent': r's\.?\s*n\.?\s*f\b|solids[- ]not[- ]fat',
    'water_percent': r'water',
    'detergent_percent': r'detergent',
    'starch_percent': r'starch',
    'urea_percent': r'urea',
}


def parse_lab_report(image_bytes: bytes, mime: str) -> dict:
    """Read a photographed or scanned lab certificate into batch fields (Nemotron Parse + extraction)."""
    if not image_bytes.startswith(IMAGE_SIGNATURES):
        return {'engine': 'rules', 'fields': {}, 'text': '', 'error': 'Upload a JPG or PNG photo of the report.'}
    if not nvidia.is_configured():
        return {'engine': 'rules', 'fields': {}, 'text': '', 'error': 'Add an NVIDIA API key to read lab reports automatically.'}
    text = nvidia.parse_document(base64.b64encode(image_bytes).decode(), mime or 'image/png', context={'feature': 'lab_report'})
    if not text:
        return {'engine': nvidia.engine_label('parse'), 'fields': {}, 'text': '',
                'error': 'The report could not be read. Try a sharper, well-lit photo.'}

    fields = {}
    for line in text.splitlines():
        low = line.lower()
        for key, pattern in LAB_FIELDS.items():
            if key in fields or not re.search(pattern, low):
                continue
            value = line.split(':', 1)[-1]
            num = re.search(r'(\d+(?:\.\d+)?)', value)
            if num:
                fields[key] = float(num.group(1))
            elif re.search(r'negative|absent|not detected|\bnil\b|\bnone\b', low):
                fields[key] = 0.0
            elif re.search(r'positive|present|detected', low):
                fields[key] = 1.0
        batch = re.search(r'batch\W*([A-Z0-9][A-Z0-9-]{3,})', line, re.I)
        if batch and 'code' not in fields:
            fields['code'] = batch.group(1).upper()
    return {'engine': nvidia.engine_label('parse'), 'fields': fields, 'text': text[:3000], 'error': ''}


# --- Customer assistant ("Ask Gawali") -----------------------------------------------------

ACTION_TYPES = {'skip_day', 'unskip_day', 'set_quantity', 'add_order', 'vacation'}


def customer_assistant(context: dict, messages: list[dict]) -> dict:
    history = [
        {'role': m['role'], 'content': str(m['content'])[:1500]}
        for m in messages[-10:] if m.get('role') in ('user', 'assistant') and m.get('content')
    ]
    if not history or history[-1]['role'] != 'user':
        return {'reply': 'How can I help with your deliveries?', 'actions': [], 'engine': 'rules'}

    if nvidia.is_configured():
        system = (
            'You are Gawali, the calm, concise assistant inside Gawali, an Indian daily milk subscription app. '
            'You help the customer understand and change their deliveries. Reply in the same language and script as '
            'the customer\'s latest message: English to English, Hinglish to Hinglish, Hindi or Marathi in Devanagari '
            'to the same. Keep replies under 70 words, warm and plain. Use ₹. When the customer asks to add an item '
            'without a quantity, propose 1 for the next editable day; they can change it. '
            'You can PROPOSE actions; the customer confirms them with a tap, so never claim an action is already done. '
            'Only propose changes for dates on or after editable_from. Use ids exactly as given in the context.\n'
            'Allowed actions:\n'
            '{"type":"skip_day","date":"YYYY-MM-DD"}\n'
            '{"type":"unskip_day","date":"YYYY-MM-DD"}\n'
            '{"type":"set_quantity","date":"YYYY-MM-DD","subscription_id":"<id>","quantity":<number>}\n'
            '{"type":"add_order","date":"YYYY-MM-DD","product_id":"<id>","quantity":<number>}\n'
            '{"type":"vacation","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}\n'
            'Respond ONLY with JSON: {"reply": "<text>", "actions": [<0 to 3 actions>]}\n\n'
            f'Customer context: {dumps(context)}'
        )
        language = _language_of(history[-1]['content'])
        system += f'\nThe customer\'s latest message is in {language}. Your "reply" MUST be in {language}.'
        raw = nvidia.chat([{'role': 'system', 'content': system + ASSISTANT_EXAMPLES}] + history, task='chat',
                          temperature=0.3, max_tokens=600, context={'feature': 'assistant'})
        data = nvidia.extract_json(raw)
        if isinstance(data, dict) and data.get('reply'):
            return {'reply': str(data['reply'])[:800], 'actions': _valid_actions(data.get('actions'), context),
                    'engine': nvidia.engine_label('chat')}
        if raw:
            return {'reply': raw[:800], 'actions': [], 'engine': nvidia.engine_label('chat')}

    return _rule_assistant(context, history[-1]['content'])


ASSISTANT_EXAMPLES = """

Domain notes: "doodh" = milk, "dahi" = curd, "kal" = tomorrow, "parso" = day after tomorrow, "band karo",
"nako" or "mat bhejna" = stop/skip. Glass bottles are returnable with a refundable deposit. Changes close at the
cutoff the night before. Online payments are switched off for now: bills are settled with the dairy directly, so never
offer top-ups, UPI links, autopay or withdrawals.

Examples (ids shortened):
User: kal doodh mat bhejna
{"reply": "Theek hai. Main kal ki delivery skip kar sakta hoon. Confirm karne ke liye neeche tap karein.", "actions": [{"type": "skip_day", "date": "<tomorrow>"}]}
User: send 1 extra litre on Sunday, guests are coming
{"reply": "Happy to. I can raise Sunday's A2 milk from 2 to 3 bottles. Tap to confirm.", "actions": [{"type": "set_quantity", "date": "<sunday>", "subscription_id": "<id>", "quantity": 3}]}
User: why was I charged 194 yesterday?
{"reply": "Yesterday you received 2 x A2 Gir Cow Milk (Rs 184), and one more bottle stayed at home, so a Rs 10 refundable deposit was added. It comes back when the bottle is collected.", "actions": []}
User: the milk was spoiled today
{"reply": "Sorry about that. Tap 'Issue with today's milk' on Home and take a photo; the credit is added in seconds.", "actions": []}
User: add curd to my next delivery
{"reply": "I can add 1 x Set Curd (Rs 45) to tomorrow's delivery. Tap to confirm.", "actions": [{"type": "add_order", "date": "<editable_from>", "product_id": "<curd id>", "quantity": 1}]}
User: mujhe kal ka doodh nahi chahiye
{"reply": "Theek hai. Main kal ki delivery skip kar sakta hoon. Confirm karne ke liye tap karein.", "actions": [{"type": "skip_day", "date": "<tomorrow>"}]}
"""


HINGLISH_WORDS = {'kal', 'parso', 'doodh', 'dahi', 'bhejna', 'bhejo', 'nahi', 'chahiye', 'karo', 'hai', 'hain',
                  'kitna', 'kya', 'mujhe', 'aaj', 'nako', 'pahije', 'udya', 'dudh', 'theek', 'aur', 'abhi'}


def _language_of(text: str) -> str:
    """Name the reply language explicitly; the model otherwise drifts towards the Hinglish examples."""
    if re.search(r'[ऀ-ॿ]', text):
        return 'Marathi (Devanagari)' if re.search(r'(आहे|नको|उद्या|पाहिजे|दूध नको)', text) else 'Hindi (Devanagari)'
    words = set(re.findall(r'[a-z]+', text.lower()))
    return 'Hinglish (Hindi in Latin script)' if len(words & HINGLISH_WORDS) >= 1 else 'English'


def _valid_actions(actions, context) -> list[dict]:
    if not isinstance(actions, list):
        return []
    editable_from = context.get('editable_from', '')
    sub_ids = {s['subscription_id'] for s in context.get('subscriptions', [])}
    product_ids = {p['id'] for p in context.get('catalog', [])}
    out = []
    for a in actions[:3]:
        if not isinstance(a, dict) or a.get('type') not in ACTION_TYPES:
            continue
        d = a.get('date') or a.get('start_date') or ''
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) or d < editable_from:
            continue
        if a['type'] == 'set_quantity' and (a.get('subscription_id') not in sub_ids or not _num(a.get('quantity'), 0, 20)):
            continue
        if a['type'] == 'add_order' and (a.get('product_id') not in product_ids or not _num(a.get('quantity'), 0.5, 20)):
            continue
        if a['type'] == 'vacation' and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.get('end_date') or '') \
                or a['type'] == 'vacation' and a['end_date'] < a['start_date']:
            continue
        out.append({k: v for k, v in a.items() if k in ('type', 'date', 'start_date', 'end_date', 'subscription_id', 'product_id', 'quantity')})
    return out


def _num(v, lo, hi) -> bool:
    try:
        return lo <= float(v) <= hi
    except (TypeError, ValueError):
        return False


def _rule_assistant(ctx: dict, text: str) -> dict:
    t = text.lower()
    target = ctx.get('editable_from')
    nice = date.fromisoformat(target).strftime('%a %d %b') if target else 'the next open day'
    wallet = ctx.get('wallet', {})
    actions = []

    if any(w in t for w in ('skip', 'pause', 'cancel tomorrow', 'no milk', 'band', 'नको', 'मत')):
        actions.append({'type': 'skip_day', 'date': target})
        reply = f"I can skip your delivery for {nice}. Tap below to confirm — you can undo it until the cutoff."
    elif any(w in t for w in ('vacation', 'holiday', 'away', 'travel', 'trip')):
        start = date.fromisoformat(target)
        actions.append({'type': 'vacation', 'start_date': target, 'end_date': (start + timedelta(days=4)).isoformat()})
        reply = (f"Here's a 5-day pause starting {nice}. Confirm it, or open the vacation planner to pick exact dates — "
                 "deliveries resume automatically.")
    elif any(w in t for w in ('balance', 'wallet', 'money', 'recharge', 'top up', 'top-up')):
        covers = wallet.get('covers_until')
        reply = f"Your wallet balance is ₹{wallet.get('balance', 0)}."
        if covers:
            reply += f" That covers your milk until {date.fromisoformat(covers).strftime('%a %d %b')}."
    elif any(w in t for w in ('cutoff', 'time left', 'deadline', 'until when', 'last time')):
        reply = f"Changes for {nice} close at {ctx.get('cutoff_label')} tonight. After that the order is locked for the morning."
    elif 'bottle' in t:
        reply = f"You have {ctx.get('bottles_with_you', 0)} glass bottles at home. Leave rinsed empties out — each returns ₹10 to your wallet."
    elif any(w in t for w in ('more', 'extra', 'increase', 'double', 'less', 'reduce')) and ctx.get('subscriptions'):
        sub = ctx['subscriptions'][0]
        qty = float(sub['default_quantity'])
        new = qty * 2 if 'double' in t else (qty + float(sub['step']) if any(w in t for w in ('more', 'extra', 'increase')) else max(0, qty - float(sub['step'])))
        actions.append({'type': 'set_quantity', 'date': target, 'subscription_id': sub['subscription_id'], 'quantity': new})
        reply = f"I can change {sub['name']} to {new:g} {sub['unit']} for {nice}. Tap to confirm."
    else:
        added = None
        for p in ctx.get('catalog', []):
            words = [w for w in p['name'].lower().split() if len(w) > 3]
            if any(w in t for w in words):
                added = p
                break
        if added and any(w in t for w in ('add', 'want', 'need', 'send', 'order', 'chahiye', 'हवे')):
            actions.append({'type': 'add_order', 'date': target, 'product_id': added['id'], 'quantity': 1})
            reply = f"I can add 1 × {added['name']} (₹{added['price']}) to {nice}'s delivery. Tap to confirm."
        else:
            reply = ("I can skip a day, change quantities, add curd, paneer or bread to a delivery, plan a vacation, "
                     "or tell you your balance and cutoff. What would you like?")
    return {'reply': reply, 'actions': actions, 'engine': 'rules'}
