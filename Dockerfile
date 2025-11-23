# STAGE 1: Build the Scramjet Frontend
FROM node:20-alpine AS builder

RUN apk add --no-cache git sed

WORKDIR /app

# 1. Clone the repository
RUN git clone --depth 1 https://github.com/MercuryWorkshop/Scramjet-App .

# 2. Install pnpm
RUN npm install -g pnpm

# 3. Install dependencies
RUN pnpm install

# 4. CONFIGURATION PATCH (The Fix for 404s)
# We search for where the wisp url is defined and force it to root.
# Usually in public/index.js or public/uv.config.js (or similar).
# We'll try to patch the most likely suspects.
RUN find public -type f -name "*.js" -print0 | xargs -0 sed -i 's|/wisp/|/|g' || true
RUN find public -type f -name "*.js" -print0 | xargs -0 sed -i 's|"/wisp/"|"/"|g' || true

# 5. STRUCTURE FIX & BUILD
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# Build (ignoring errors to fallback to public if needed)
RUN npx vite build || echo "Build failed, falling back to public folder"

# 6. PREPARE FINAL ASSETS
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Error: No assets found</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: The Wisp Python Backend
FROM python:3.11-slim

RUN useradd -m -u 1000 scramjet
WORKDIR /app

RUN pip install --no-cache-dir wisp-python

# Copy assets
COPY --from=builder /app/final_site /app/client

USER scramjet
EXPOSE 8080

# Serve
CMD ["python3", "-m", "wisp.server", "--host", "0.0.0.0", "--port", "8080", "--static", "/app/client", "--limits", "--connections", "50", "--log-level", "info"]
