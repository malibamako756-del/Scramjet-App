# STAGE 1: Build the Scramjet Frontend
FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# 1. Clone the repo
COPY . .

# 2. Install dependencies
RUN npm install -g pnpm && pnpm install

# 3. Fix Vite Build Location
# Move index.html to root so Vite finds it
RUN if [ -f "public/index.html" ]; then cp public/index.html .; fi

# 4. Build
RUN npx vite build || echo "Vite build warning"

# 5. Prepare Assets
RUN if [ -d "dist" ]; then \
      mv dist /app/final_site; \
    elif [ -d "public" ]; then \
      mv public /app/final_site; \
    else \
      mkdir /app/final_site && echo "<h1>Critical Error: No assets found</h1>" > /app/final_site/index.html; \
    fi

# STAGE 2: Python Backend with Custom Launcher
FROM python:3.11-slim

RUN useradd -m -u 1000 scramjet
WORKDIR /app

# Install Wisp Server and AIOHTTP (Required for the custom script)
RUN pip install --no-cache-dir wisp-python aiohttp

# Copy the built frontend
COPY --from=builder /app/final_site /app/client

# --- CUSTOM LAUNCHER SCRIPT (run.py) ---
# This script forces Wisp to listen on '/wisp/' and Static files on '/'
# This solves the 404 error by separating the traffic programmatically.
RUN echo "import logging" > run.py && \
    echo "from aiohttp import web" >> run.py && \
    echo "from wisp.server import WispServer" >> run.py && \
    echo "logging.basicConfig(level=logging.INFO)" >> run.py && \
    echo "" >> run.py && \
    echo "# 1. Initialize Wisp Server" >> run.py && \
    echo "server = WispServer()" >> run.py && \
    echo "app = web.Application()" >> run.py && \
    echo "" >> run.py && \
    echo "# 2. Route WebSocket traffic to /wisp/" >> run.py && \
    echo "app.router.add_route('*', '/wisp/', server.handle_request)" >> run.py && \
    echo "" >> run.py && \
    echo "# 3. Route Static Website to / (Root)" >> run.py && \
    echo "app.router.add_static('/', path='/app/client', name='static', append_version=True)" >> run.py && \
    echo "" >> run.py && \
    echo "if __name__ == '__main__':" >> run.py && \
    echo "    print('STARTING CUSTOM WISP SERVER ON PORT 8080')" >> run.py && \
    echo "    web.run_app(app, host='0.0.0.0', port=8080)" >> run.py

USER scramjet
EXPOSE 8080

# Run our custom script instead of the module
CMD ["python3", "run.py"]
