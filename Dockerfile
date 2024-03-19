FROM node:20-slim

WORKDIR /app

COPY . .

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

EXPOSE 3000
ENV ADDRESS=0.0.0.0 PORT=3000
CMD ["pnpm", "start"]
