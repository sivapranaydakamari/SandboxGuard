FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY src ./src
COPY seeds ./seeds

ENV NODE_ENV=production
ENV API_PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
