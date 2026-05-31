# Stage 1: Build React frontend
FROM node:18-alpine AS builder-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Runner with Node.js
FROM node:18-alpine
WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci

# Copy backend files
COPY . .

# Copy compiled frontend from Stage 1
COPY --from=builder-frontend /app/frontend/dist ./frontend/dist

# Define environment variables
ENV PORT=3333

EXPOSE 3333

# Run Node.js directly!
CMD ["npm", "start"]
