# Use the python slim image as the single base image
FROM python:3.12-slim

# -------------------
# 1. Install System Dependencies + Node.js
# -------------------
# Install prerequisites like curl, then use the NodeSource script to add the
# repository for Node.js 20.x, and finally install nodejs.
RUN apt-get update && \
    apt-get install -y curl python3-venv && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# -------------------
# 2. Install Python deps for MCP client
# -------------------
# This part remains the same, but it's good practice to do it before
# copying all the app code to leverage Docker's layer caching.
COPY apps/mcp-client/pyproject.toml apps/mcp-client/README.md ./apps/mcp-client/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
        "dotenv>=0.9.9" \
        "fastapi[standard]>=0.115.13" \
        "fastmcp>=2.8.1" \
        "google-genai>=1.21.1" \
        "uvicorn>=0.34.3"
ENV PATH="/opt/venv/bin:$PATH"

# -------------------
# 3. Install pnpm & Node deps
# -------------------
# This command will now succeed because we installed Node.js (which includes npm).
RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml ./
COPY apps/mcp-server/package.json apps/mcp-server/
COPY apps/api-node/package.json apps/api-node/
COPY apps/web/package.json apps/web/

COPY packages/shared/package.json packages/shared/

RUN pnpm install

# -------------------
# 4. Copy all code (frontend last)
# -------------------
COPY apps/mcp-client ./apps/mcp-client
COPY apps/mcp-server ./apps/mcp-server
COPY apps/api-node ./apps/api-node
COPY apps/web ./apps/web

# -------------------
# 5. Expose ports
# -------------------
EXPOSE 3000 8000 5000

# -------------------
# 6. Start all apps
# -------------------
# Run turbo directly and use a filter to exclude the root package's "dev" script,
# which prevents the recursive loop.
CMD ["/app/node_modules/.bin/turbo", "run", "dev", "--filter=!//"]