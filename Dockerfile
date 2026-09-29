# Node 24 ships node:sqlite as a stable built-in, so this image has zero npm dependencies.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    TZ=Australia/Melbourne \
    TZ_NAME=Australia/Melbourne \
    DB_FILE=/data/attendance.db

RUN apk add --no-cache tzdata wget

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

# Only /data is writable by the app. The code stays root-owned, so the running
# process can read what it serves but never rewrite it.
RUN mkdir -p /data && chown node:node /data
USER node

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/index.js"]
