#!/bin/bash

cd /tmp
git clone https://github.com/SpiderLabs/ModSecurity
cd ModSecurity && git submodule init && git submodule update
./build.sh && ./configure && make && make install

cd /tmp
git clone --depth 1 https://github.com/SpiderLabs/ModSecurity-nginx.git
wget http://nginx.org/download/nginx-1.22.1.tar.gz && tar -xzvf nginx-1.22.1.tar.gz
cd nginx-1.22.1 && ./configure --add-dynamic-module=../ModSecurity-nginx --with-cc-opt='-g -O2 -ffile-prefix-map=/build/nginx-nduIyd/nginx-1.22.1=. -fstack-protector-strong -Wformat -Werror=format-security -fPIC -Wdate-time -D_FORTIFY_SOURCE=2' --with-ld-opt='-Wl,-z,relro -Wl,-z,now -fPIC' --prefix=/usr/share/nginx --conf-path=/etc/nginx/nginx.conf --http-log-path=/var/log/nginx/access.log --error-log-path=stderr --lock-path=/var/lock/nginx.lock --pid-path=/run/nginx.pid --modules-path=/usr/lib/nginx/modules --http-client-body-temp-path=/var/lib/nginx/body --http-fastcgi-temp-path=/var/lib/nginx/fastcgi --http-proxy-temp-path=/var/lib/nginx/proxy --http-scgi-temp-path=/var/lib/nginx/scgi --http-uwsgi-temp-path=/var/lib/nginx/uwsgi --with-compat --with-debug --with-pcre-jit --with-http_ssl_module --with-http_stub_status_module --with-http_realip_module --with-http_auth_request_module --with-http_v2_module --with-http_dav_module --with-http_slice_module --with-threads --with-http_addition_module --with-http_flv_module --with-http_gunzip_module --with-http_gzip_static_module --with-http_mp4_module --with-http_random_index_module --with-http_secure_link_module --with-http_sub_module --with-mail_ssl_module --with-stream_ssl_module --with-stream_ssl_preread_module --with-stream_realip_module --with-http_geoip_module=dynamic --with-http_image_filter_module=dynamic --with-http_perl_module=dynamic --with-http_xslt_module=dynamic --with-mail=dynamic --with-stream=dynamic --with-stream_geoip_module=dynamic
make modules

cp /tmp/nginx-1.22.1/objs/ngx_http_modsecurity_module.so /etc/nginx/modules

cd /tmp
git clone https://github.com/coreruleset/coreruleset.git modsecurity-crs

cd modsecurity-crs && mv crs-setup.conf.example crs-setup.conf && mv rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
cd /tmp && mv modsecurity-crs /usr/local
mkdir -p /etc/nginx/modsec && cp /tmp/ModSecurity/unicode.mapping /etc/nginx/modsec
mv /tmp/ModSecurity/modsecurity.conf-recommended /tmp/ModSecurity/modsecurity.conf && cp /tmp/ModSecurity/modsecurity.conf /etc/nginx/modsec/





















