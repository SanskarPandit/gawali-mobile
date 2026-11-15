"""
Export logged AI calls as JSONL for fine-tuning or offline evaluation.

    python manage.py export_ai_dataset --task vision --labelled > vision_eval.jsonl

Each line: {"task", "model", "messages", "output", "label", "label_note", "latency_ms", "created_at"}.
Images are not stored (only a marker), so vision rows are evaluation records rather than direct training pairs.
"""
import json

from django.core.management.base import BaseCommand

from apps.assistant.models import AIInteraction


class Command(BaseCommand):
    help = 'Export AI interactions (optionally only human-labelled ones) as JSONL.'

    def add_arguments(self, parser):
        parser.add_argument('--task', choices=['chat', 'vision', 'insight', 'parse'])
        parser.add_argument('--labelled', action='store_true', help='Only rows a human decision has labelled')
        parser.add_argument('--limit', type=int, default=5000)

    def handle(self, *args, **opts):
        qs = AIInteraction.objects.filter(error='').order_by('created_at')
        if opts['task']:
            qs = qs.filter(task=opts['task'])
        if opts['labelled']:
            qs = qs.exclude(label='')
        for row in qs[:opts['limit']]:
            self.stdout.write(json.dumps({
                'task': row.task, 'model': row.model, 'messages': row.prompt, 'output': row.output,
                'label': row.label, 'label_note': row.label_note, 'latency_ms': row.latency_ms,
                'created_at': row.created_at.isoformat(),
            }, ensure_ascii=False))
