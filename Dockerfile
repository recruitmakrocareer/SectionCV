FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000 DATA_DIR=/app/data
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8000
VOLUME ["/app/data"]
CMD ["node", "server/index.cjs"]
