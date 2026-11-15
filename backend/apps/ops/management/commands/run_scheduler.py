"""
Run the background scheduler.

    python manage.py run_scheduler           # keep running (production: its own process/container)
    python manage.py run_scheduler --once    # run whatever is due right now and exit (cron / tests)

The loop decides what is due from the clock and an hourly-refreshed list of dairies, and only opens a
database connection when a job actually needs to run. That lets a serverless database (Neon) scale to
zero between jobs instead of being kept awake by polling.
"""
import signal
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, connections
from django.utils import timezone

from apps.dairies.models import Dairy
from apps.ops import jobs

DAIRY_REFRESH_SECONDS = 3600


class Command(BaseCommand):
    help = 'Run scheduled jobs: manifests, cutoff reminders, credit holds, missed-stop closing, dues reminders, cleanup.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true')
        parser.add_argument('--job', help='Only this job')
        parser.add_argument('--interval', type=int, default=30)

    def handle(self, *args, **opts):
        stop = {'flag': False}
        signal.signal(signal.SIGINT, lambda *_: stop.update(flag=True))
        signal.signal(signal.SIGTERM, lambda *_: stop.update(flag=True))
        self.stdout.write(self.style.SUCCESS('Gawali scheduler started.'), ending='\n')
        self.stdout.flush()

        dairies, loaded_at = [], 0.0
        done: set[tuple[str, str]] = set()  # (job, period) handled this process; no DB needed to remember it
        while True:
            try:
                if time.monotonic() - loaded_at > DAIRY_REFRESH_SECONDS or not dairies:
                    dairies = list(Dairy.objects.filter(is_active=True))
                    loaded_at = time.monotonic()
                    close_old_connections()
                now = timezone.localtime()
                due = self._due(now, dairies, opts['job'], done)
                if due:
                    results = jobs.run_due_jobs(now, only=opts['job'], dairies=dairies)
                    failed = {(r['job'], r['period']) for r in results if r['status'] == 'failed'}
                    for r in results:
                        self.stdout.write(f"  {r['job']:<18} {r['period']:<50} {r['status']}")
                    self.stdout.flush()
                    done.update(due - failed)  # failed runs are retried on the next tick (up to MAX_ATTEMPTS)
                    connections.close_all()  # release the connection so the database can go idle
                if len(done) > 5000:
                    today = now.date().isoformat()
                    done = {d for d in done if d[1].startswith(today)}
            except Exception as exc:  # keep the loop alive through transient DB/network errors
                self.stderr.write(f'scheduler tick failed: {exc}')
                connections.close_all()
            if opts['once'] or stop['flag']:
                break
            for _ in range(opts['interval']):
                if stop['flag']:
                    break
                time.sleep(1)
        self.stdout.write('Scheduler stopped.')

    @staticmethod
    def _due(now, dairies, only, done) -> set[tuple[str, str]]:
        out = set()
        for job in jobs.JOBS:
            if only and job.name != only:
                continue
            for dairy in (dairies if job.per_dairy else [None]):
                try:
                    if not job.due(now, dairy):
                        continue
                except Exception:
                    continue
                key = (job.name, jobs.period_for(now, dairy, job))
                if key not in done:
                    out.add(key)
        return out
