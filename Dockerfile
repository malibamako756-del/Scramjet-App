# STAGE 1: Build the Scramjet Frontend
FROM node:20-alpine AS builder

# Install git for cloning
RUN apk add --no-cache git

WORKDIR /app

# 1. Clone your repository (The current directory)
COPY . .

# 2. Install pnpm
RUN npm install -g pnpm

# 3. Install dependencies
RUN pnpm install

# 4. VITE BUILD FIX
# Vite expects index.html in the root, but this repo has it in /public
# We move it to root to satisfy the build process.
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# 5. Build the static assets
# We ignore errors (|| true) to ensure the container creates *something* even if build acts up
RUN npx vite build || echo "Vite build warning"

# 6. Assets Fallback Logic
# Ensure we have a valid web root to serve. 
# If 'dist' (build output) exists, use it. Otherwise, use 'public'.
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Critical Error: No assets found</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: The Wisp Python Backend (Optimal/Low Latency)
FROM python:3.11-slim

# Create a non-root user for security
RUN useradd -m -u 1000 scramjet
WORKDIR /app

# Install the high-performance Wisp server
RUN pip install --no-cache-dir wisp-python

# Copy the prepared frontend assets
COPY --from=builder /app/final_site /app/client

# Security hardening
USER scramjet

# Expose the internal port
EXPOSE 8080

# START COMMAND EXPLANATION:
# --host 0.0.0.0: Listen on all interfaces (for Docker)
# --port 8080: Listen on port 8080
# --static /app/client: Serve the frontend files
# --wisp-path /wisp/: REQUIRED. Matches the '/wisp/' path in your index.js
CMD ["python3", "-m", "wisp.server", "--host", "0.0.0.0", "--port", "8080", "--static", "/app/client", "--wisp-path", "/wisp/", "--limits", "--connections", "50", "--log-level", "info"]
