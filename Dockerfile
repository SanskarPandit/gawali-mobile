# Gawali — production image: builds the web app, then serves it and the API from Django.
#   docker build -t gawali .
#   docker run --env-file backend/.env -p 8000:8000 gawali                 # web + API
#   docker run --env-file backend/.env gawali python manage.py run_scheduler # background jobs

FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    WEB_DIST=/web/dist
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /web/dist
# Static files are baked into the image; a throwaway key lets collectstatic import settings.
RUN DJANGO_SECRET_KEY=build-only-placeholder-key-that-is-long-enough-for-checks-123456 \
    DB_ENGINE=sqlite DJANGO_SETTINGS_MODULE=config.settings.base python manage.py collectstatic --noinput
RUN useradd --create-home gawali && chown -R gawali /app
USER gawali
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://localhost:8000/healthz || exit 1
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py createcachetable && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-4} --threads 4 --timeout 60 --access-logfile -"]
