# Stage 1: Build frontend React app
FROM node:18-alpine AS builder-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Install backend Node.js dependencies
FROM node:18-alpine AS builder-backend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Stage 3: Setup lightweight runner with Node.js and Caddy
FROM caddy:2-alpine
# Install Node.js on Alpine so we can execute the backend server
RUN apk add --no-cache nodejs npm

WORKDIR /app

# Copy compiled static frontend assets
COPY --from=builder-frontend /app/frontend/dist ./frontend/dist

# Copy backend files and root dependencies
COPY --from=builder-backend /app ./

# Copy Caddyfile to the correct place
COPY Caddyfile /etc/caddy/Caddyfile

# Define default ports
ENV PORT=3333
ENV BACKEND_PORT=8080

EXPOSE 3333

# Run both the Express server in the background and Caddy in the foreground
CMD node server.js & caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
