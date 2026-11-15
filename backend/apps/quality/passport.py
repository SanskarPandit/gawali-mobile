import io
from datetime import datetime

from django.utils import timezone
from reportlab.graphics.shapes import Drawing, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import SAFE_TEMP_MAX, SAFE_TEMP_MIN, MilkBatch

CHARCOAL = colors.HexColor('#191715')
TERRACOTTA = colors.HexColor('#8B6244')
SAGE = colors.HexColor('#2E7D47')
SAND = colors.HexColor('#EAE6DF')
MUTED = colors.HexColor('#716B64')
IVORY = colors.HexColor('#FBF9F5')


def _local(dt) -> datetime:
    return timezone.localtime(dt)


def passport_dict(batch: MilkBatch) -> dict:
    lo, hi = batch.temperature_range
    milked = _local(batch.milked_at)
    today = timezone.localdate()
    day_word = 'today' if milked.date() == today else 'yesterday' if (today - milked.date()).days == 1 else milked.strftime('%d %b')
    first_chill = next((r for r in batch.temperature_log if r.get('phase') != 'milking' and float(r['c']) <= 4.2), None)
    return {
        'id': str(batch.id),
        'code': batch.code,
        'animal': batch.animal,
        'delivery_date': batch.delivery_date.isoformat(),
        'hub_name': batch.hub_name,
        'milked_at': milked.isoformat(),
        'milked_label': f"Milked {day_word} at {milked.strftime('%I:%M %p').lstrip('0')} at {batch.hub_name}",
        'chilled_at': _local(batch.chilled_at).isoformat(),
        'minutes_to_chill': batch.minutes_to_chill,
        'chill_temp': float(first_chill['c']) if first_chill else None,
        'temperature_log': batch.temperature_log,
        'temp_min': float(lo) if lo is not None else None,
        'temp_max': float(hi) if hi is not None else None,
        'safe_min': float(SAFE_TEMP_MIN),
        'safe_max': float(SAFE_TEMP_MAX),
        'cold_chain_ok': batch.cold_chain_ok,
        'lab': {
            'fat': float(batch.fat_percent), 'snf': float(batch.snf_percent),
            'water': float(batch.water_percent), 'detergent': float(batch.detergent_percent),
            'starch': float(batch.starch_percent), 'urea': float(batch.urea_percent),
            'adulteration_free': batch.is_adulteration_free,
            'lab_name': batch.lab_name, 'certified_by': batch.certified_by,
        },
        'status': batch.status,
    }


def _curve(batch: MilkBatch, width=118 * mm, height=38 * mm) -> Drawing:
    d = Drawing(width, height)
    log = [r for r in batch.temperature_log if r.get('phase') != 'milking'] or batch.temperature_log
    if len(log) < 2:
        return d
    lo, hi = 0.0, 8.0
    pad_l, pad_b = 22, 12
    w, h = width - pad_l - 4, height - pad_b - 6

    def y(c):
        return pad_b + (min(max(c, lo), hi) - lo) / (hi - lo) * h

    d.add(Rect(pad_l, y(float(SAFE_TEMP_MIN)), w, y(float(SAFE_TEMP_MAX)) - y(float(SAFE_TEMP_MIN)),
               fillColor=colors.HexColor('#E3F0E6'), strokeColor=None))
    for c in (0, 4, 8):
        d.add(Line(pad_l, y(c), pad_l + w, y(c), strokeColor=SAND, strokeWidth=0.5))
        d.add(String(2, y(c) - 2, f'{c}°C', fontSize=6, fillColor=MUTED, fontName='Helvetica'))
    pts = []
    for i, r in enumerate(log):
        pts += [pad_l + i / (len(log) - 1) * w, y(float(r['c']))]
    d.add(PolyLine(pts, strokeColor=SAGE, strokeWidth=1.4))
    d.add(String(pad_l, 1, _local(datetime.fromisoformat(log[0]['t'])).strftime('%I:%M %p'), fontSize=6, fillColor=MUTED))
    d.add(String(pad_l + w - 30, 1, _local(datetime.fromisoformat(log[-1]['t'])).strftime('%I:%M %p'), fontSize=6, fillColor=MUTED))
    return d


def passport_pdf(batch: MilkBatch, customer_name: str | None = None) -> bytes:
    data = passport_dict(batch)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f'Purity Passport {batch.code}', author=batch.dairy.business_name)
    h = ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=17, textColor=CHARCOAL, leading=21)
    eyebrow = ParagraphStyle('e', fontName='Helvetica-Bold', fontSize=7, textColor=TERRACOTTA, leading=10)
    body = ParagraphStyle('b', fontName='Helvetica', fontSize=8.5, textColor=MUTED, leading=12)
    strong = ParagraphStyle('s', parent=body, textColor=CHARCOAL, fontName='Helvetica-Bold')

    lab = data['lab']
    rows = [
        ['Fat content', f"{lab['fat']:.1f}%", 'Solids-not-fat (SNF)', f"{lab['snf']:.1f}%"],
        ['Water', f"{lab['water']:.2f}%", 'Detergent', f"{lab['detergent']:.2f}%"],
        ['Starch', f"{lab['starch']:.2f}%", 'Urea', f"{lab['urea']:.2f}%"],
    ]
    table = Table(rows, colWidths=[32 * mm, 22 * mm, 38 * mm, 24 * mm])
    table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 8.5),
        ('FONT', (1, 0), (1, -1), 'Helvetica-Bold', 9), ('FONT', (3, 0), (3, -1), 'Helvetica-Bold', 9),
        ('TEXTCOLOR', (0, 0), (-1, -1), CHARCOAL), ('TEXTCOLOR', (0, 0), (0, -1), MUTED), ('TEXTCOLOR', (2, 0), (2, -1), MUTED),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, SAND), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))

    status = 'CERTIFIED PURE' if data['status'] == 'passed' and lab['adulteration_free'] else data['status'].upper()
    story = [
        Paragraph(f"{batch.dairy.business_name.upper()} · BATCH PURITY PASSPORT", eyebrow), Spacer(1, 3),
        Paragraph(f"Batch {batch.code}", h), Spacer(1, 2),
        Paragraph(data['milked_label'] + f" · for delivery on {batch.delivery_date.strftime('%a %d %b %Y')}", body),
        Spacer(1, 8),
        Paragraph(f"<font color='#2E7D47'>●</font> {status} &nbsp;&nbsp; Chilled to {data['chill_temp'] or '—'}°C within "
                  f"{data['minutes_to_chill']} min &nbsp;&nbsp; Held {data['temp_min']:.1f}–{data['temp_max']:.1f}°C", strong),
        Spacer(1, 10),
        Paragraph('COLD-CHAIN TRANSIT CURVE (safe band 2.8–4.2°C shaded)', eyebrow), Spacer(1, 4),
        _curve(batch), Spacer(1, 10),
        Paragraph('LAB QUALITY METRICS', eyebrow), Spacer(1, 2), table, Spacer(1, 10),
        Paragraph(f"Tested by {lab['lab_name']}" + (f", certified by {lab['certified_by']}" if lab['certified_by'] else '') + '.', body),
    ]
    if customer_name:
        story += [Spacer(1, 4), Paragraph(f'Issued to {customer_name} on {timezone.localdate().strftime("%d %b %Y")}.', body)]
    story += [Spacer(1, 6), Paragraph('Verify this certificate in the Gawali app using the batch code above.', body)]

    def background(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(IVORY)
        canvas.rect(0, 0, A5[0], A5[1], fill=1, stroke=0)
        canvas.setFillColor(TERRACOTTA)
        canvas.rect(0, A5[1] - 3, A5[0], 3, fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=background)
    return buf.getvalue()
