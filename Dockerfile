FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
ENV OAMP_HOST=0.0.0.0
EXPOSE 8787
VOLUME ["/app/.data"]
CMD ["node", "src/cli.ts", "serve"]
