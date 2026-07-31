FROM node:22-alpine AS base

# sharp/heic-convert need these at build time on alpine
RUN apk add --no-cache libc6-compat vips-dev

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Uploaded images must persist across restarts - mount a volume here
# in docker-compose.yml / your platform's volume settings.
RUN mkdir -p src/uploads/originals

ENV NODE_ENV=production
EXPOSE 5000

USER node

CMD ["node", "server.js"]
