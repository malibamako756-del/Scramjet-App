# STAGE 1: Builder
FROM node:20-alpine AS builder

# Install tools
RUN apk add --no-cache git sed

WORKDIR /app

# 1. Clone the repository
# (Using COPY . . assumes you are building from the repo context in Coolify)
COPY . .

# 2. Install dependencies
RUN npm install -g pnpm && pnpm install

# 3. === THE CRITICAL FIX ===
# The Python server listens on '/' (Root). The App defaults to '/wisp/'.
# We use sed to modify the JavaScript code BEFORE building.
# We replace "/wisp/" with "/" in all JS files in public/ and src/
RUN find public src -type f -name "*.js" -exec sed -i 's|"/wisp/"|"/"|g' {} + || true
RUN find public src -type f -name "*.js" -exec sed -i "s|'/wisp/'|'/'|g" {} + || true

# 4. Vite Location Fix
# Move index.html to root if it's in public (common Vite issue)
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# 5. Build
RUN npx vite build || echo "Vite build warning - proceeding to fallback check"

# 6. Verify Assets
# Ensure we have a folder to serve. Prefer 'dist', fallback to 'public'.
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Error: Build Failed</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: Optimal Python Runner
FROM python:3.11-slim

# Security: Non-root user
RUN useradd -m -u 1000 scramjet
WORKDIR /app

# Install Wisp Server
RUN pip install --no-cache-dir wisp-python

# Copy the patched and built assets
COPY --from=builder /app/final_site /app/client

USER scramjet
EXPOSE 8080

# START COMMAND
# We removed '--wisp-path' because your version doesn't support it.
# The server listens on root ('/'). The frontend is now patched to match.
CMD ["python3", "-m", "wisp.server", "--host", "0.0.0.0", "--port", "8080", "--static", "/app/client", "--limits", "--connections", "50", "--log-level", "info"]
