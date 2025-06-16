FROM postgres:14

# Argomenti che possono essere sovrascritti durante la build
ARG POSTGRES_USER=django
ARG POSTGRES_PASSWORD=django
ARG POSTGRES_DB=django_db

# Variabili d'ambiente per la configurazione di PostgreSQL
ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV POSTGRES_DB=$POSTGRES_DB

# Configurazione per migliorare le prestazioni con Django
RUN echo "host all  all    0.0.0.0/0  md5" >> /etc/postgresql/pg_hba.conf && \
	echo "listen_addresses='*'" >> /etc/postgresql/postgresql.conf

# Espone la porta standard di PostgreSQL
EXPOSE 5432

# Volume per i dati persistenti
VOLUME ["/var/lib/postgresql/data"]