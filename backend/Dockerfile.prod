FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# curl utile au healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Paramètre Django (module projet)
ENV DJANGO_SETTINGS_MODULE=gestionnaire_mdp.settings

# Collecte des statiques (servis par WhiteNoise)
RUN python manage.py collectstatic --noinput || true

EXPOSE 8000

# Shell form (PAS de JSON multiline)
CMD gunicorn gestionnaire_mdp.wsgi:application \
    --bind 0.0.0.0:8000 --workers 3 --threads 4 --timeout 60 \
    --access-logfile - --error-logfile -
