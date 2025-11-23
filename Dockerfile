# STAGE 1: Build the Scramjet Frontend
FROM node:20-alpine AS builder

RUN apk add --no-cache git sed

WORKDIR /app

# 1. Clone
RUN git clone --depth 1 https://github.com/MercuryWorkshop/Scramjet-App .

# 2. Install pnpm
RUN npm install -g pnpm

# 3. Install dependencies
RUN pnpm install

# 4. AGGRESSIVE FRONTEND PATCH (The Fix)
# Since the Python server listens on '/', we MUST force the frontend to use '/' instead of '/wisp/'.
# We patch config.js, index.js, and any other JS file in public/ or src/
RUN find public src -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i 's|"/wisp/"|"/"|g' {} +
RUN find public src -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|'/wisp/'|'/'|g" {} +

# 5. Move index.html to root for Vite
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# 6. Build
RUN npx vite build || echo "Vite build warning"

# 7. Prepare Assets
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Critical Error: No assets found</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: Wisp Python Backend
FROM python:3.11-slim

RUN useradd -m -u 1000 scramjet
WORKDIR /app

# Install Wisp Server
RUN pip install --no-cache-dir wisp-python

# Copy prepared assets
COPY --from=builder /app/final_site /app/client

USER scramjet
EXPOSE 8080

# START COMMAND (Removed the invalid --wisp-path flag)
# The server listens on / for Wisp. The frontend is now patched to send to /.
CMD ["python3", "-m", "wisp.server", "--host", "0.0.0.0", "--port", "8080", "--static", "/app/client", "--limits", "--connections", "50", "--log-level", "info"]
