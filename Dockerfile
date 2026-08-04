FROM node:22-alpine

RUN apk add --no-cache \
    libc6-compat \
    vips-dev \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create upload directories
RUN mkdir -p /app/src/uploads/originals \
    && mkdir -p /app/src/uploads/temp \
    && chown -R node:node /app/src/uploads

ENV NODE_ENV=production

EXPOSE 5000

USER node

CMD ["node", "server.js"]