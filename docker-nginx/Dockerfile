FROM debian:12

RUN apt-get update && apt-get install -y \
	nginx \
	openssl \
	ca-certificates \
	libpcre2-dev \
	libpcre3-dev \
	libssl-dev \
	zlib1g-dev \
	libgd-dev \
	&& rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /etc/nginx/ssl \
	/usr/share/nginx/html/static \
	/usr/share/nginx/html/media

# Copy SSL certificates
COPY ./nginx.crt /etc/nginx/ssl/nginx.crt
COPY ./nginx.key /etc/nginx/ssl/nginx.key
COPY ssl/django.crt /etc/nginx/ssl/
COPY ssl/django.key /etc/nginx/ssl/

# Copy nginx configuration
COPY src/nginx.conf /etc/nginx/

# Copy static files
COPY src/index.html /usr/share/nginx/html/
COPY src/pages /usr/share/nginx/html/pages/
COPY src/js /usr/share/nginx/html/js/
COPY src/css /usr/share/nginx/html/css/

# Set correct permissions
RUN chown -R www-data:www-data /usr/share/nginx/html && \
	chmod -R 755 /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]