# STAGE 1: Build the Frontend
FROM node:20-alpine AS builder

RUN apk add --no-cache git sed

WORKDIR /app

# 1. Clone and Install
COPY . .
RUN npm install -g pnpm && pnpm install

# 2. Reset Configuration (Ensure defaults)
RUN find public src -type f -name "*.js" -exec sed -i 's|"/wisp/"|"/wisp/"|g' {} + || true

# 3. Vite Fix
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# 4. Build
RUN npx vite build || echo "Vite build warning"

# 5. Prepare Assets
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Error: Build Failed</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: Nginx + Python Wisp (Production)
FROM python:3.11-slim

# Install Nginx and Wisp
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir wisp-python

WORKDIR /app

# Copy Frontend to Nginx Root
COPY --from=builder /app/final_site /var/www/html

# --- CONFIGURE NGINX (The Traffic Splitter) ---
# We use a heredoc to write the config cleanly. 
# This configures Nginx to serve files on /, and proxy /wisp/ to Python.
RUN echo 'events { worker_connections 1024; } \
http { \
    include       /etc/nginx/mime.types; \
    default_type  application/octet-stream; \
    server { \
        listen 8080; \
        root /var/www/html; \
        index index.html; \
        \
        location / { \
            try_files $uri $uri/ /index.html; \
        } \
        \
        location /wisp/ { \
            proxy_pass http://127.0.0.1:9000; \
            proxy_http_version 1.1; \
            proxy_set_header Upgrade $http_upgrade; \
            proxy_set_header Connection "Upgrade"; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
        } \
    } \
}' > /etc/nginx/nginx.conf

# Expose the port Traefik talks to
EXPOSE 8080

# --- START COMMAND ---
# Start Python in background (port 9000), then start Nginx in foreground (port 8080)
CMD ["sh", "-c", "python3 -m wisp.server --host 127.0.0.1 --port 9000 --limits --connections 50 --log-level info & nginx -g 'daemon off;'"]
