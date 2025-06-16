FROM debian:latest

RUN apt-get update && apt-get install -y \
	python3 \
	python3-pip \
	python3-venv \
	python3-dev \
	build-essential \
	netcat-openbsd \
	openssl \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . /app/

RUN chmod +x /app/entrypoint.sh

RUN pip3 install --no-cache-dir --break-system-packages -r /app/requirements.txt

# Crea directory per i certificati
RUN mkdir -p /app/certs

# Run migrations via entrypoint and then Daphne with SSL
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["daphne", "-e", "ssl:8443:privateKey=/app/ssl/django.key:certKey=/app/ssl/django.crt", "-b", "0.0.0.0", "-p", "8000", "backend.asgi:application"]

