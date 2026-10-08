# One container serves the API, the built frontend and the 18:00 reminder job.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/server/migrations ./src/server/migrations
USER node
EXPOSE 3000
# Migrations run automatically at start-up.
CMD ["node", "dist/server/index.js"]
