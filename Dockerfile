FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY server ./server
COPY src/db ./src/db
COPY src/domain ./src/domain
COPY src/repo ./src/repo
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--experimental-sqlite", "--no-warnings", "--import", "./server/register.mjs", "server/index.ts"]
