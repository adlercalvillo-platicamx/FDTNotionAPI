FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_API_BASE_URL
ARG VITE_EVENT_DATES=2026-10-07,2026-10-08
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_EVENT_DATES=$VITE_EVENT_DATES
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
