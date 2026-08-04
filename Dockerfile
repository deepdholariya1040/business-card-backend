FROM node:22-alpine AS base

# Required packages for sharp/node-gyp on Alpine
RUN apk add --no-cache \
    libc6-compat \
    vips-dev \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

COPY . .

# Uploaded images must persist across restarts.
# Mount a persistent volume here in Railway.
RUN mkdir -p /app/src/uploads/originals

ENV NODE_ENV=production

EXPOSE 5000

USER node

CMD ["node", "server.js"]