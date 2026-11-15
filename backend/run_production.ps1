# Run Gawali in production mode on Windows (waitress = production WSGI server; gunicorn is Linux-only).
#   powershell -ExecutionPolicy Bypass -File run_production.ps1
$env:DJANGO_SETTINGS_MODULE = "config.settings.production"
Set-Location $PSScriptRoot
.\venv\Scripts\python.exe manage.py migrate --noinput
.\venv\Scripts\python.exe manage.py createcachetable
.\venv\Scripts\python.exe manage.py collectstatic --noinput
Start-Process -NoNewWindow .\venv\Scripts\python.exe -ArgumentList "manage.py", "run_scheduler"
.\venv\Scripts\waitress-serve.exe --listen=0.0.0.0:8000 --threads=16 config.wsgi:application
