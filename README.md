<img src="readme-assets/logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

![](readme-assets/demo.gif)

## Table of Contents

- [Features](#features)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Quickstart](#quickstart)
  - [Advanced](#advanced)
- [Development](#development)
- [Credits](#credits)

## Features

<details>
<summary>Persistent storage for all your drawings</summary>

![](readme-assets/dashboard.png)

</details>

<details>
<summary>Real time collaboration</summary>

![](readme-assets/collabDemo.gif)

</details>

<details>
<summary>Version history and restore</summary>

Automatically retain recent drawing snapshots, preview past versions from the editor, and restore a previous state when needed.

</details>

<details>
<summary>(Optional) Multi User Authentication, OIDC Support</summary>

### Sign in with OIDC

![](readme-assets/signInOIDC.png)

### Migration from v0.3

![](readme-assets/migrationScreen.png)

### Admin Bootstrap

![](readme-assets/adminBootstrap.png)

### Admin Dashboard

![](readme-assets/adminDashboard.png)

</details>

<details>
<summary>Scoped internal & external sharing</summary>

![](readme-assets/scoped.png)

</details>
<details>
<summary>Search your drawings</summary>

![](readme-assets/search.gif)

</details>

<details>
<summary>Drag and drop drawings into collections</summary>

![](readme-assets/collections.gif)

</details>

<details>
<summary>Export/import your drawings for backup</summary>

### Excalidash uses a non-proprietary archival format that stores your drawings in plain .excalidraw format

![](readme-assets/backupsImport.gif)

</details>

# Upgrading

See [release notes](https://github.com/ZimengXiong/ExcaliDash/releases) for a specific release.

ExcaliDash includes an in-app update notifier that checks GitHub Releases. If your deployment must not make outbound network calls, disable it on the backend:

```bash
UPDATE_CHECK_OUTBOUND=false
```

## Docker Hub Upgrades

If you deployed using `docker-compose.prod.yml` (Docker Hub images), upgrade by pulling the latest images and recreating containers:

```bash
docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

If you prefer a clean stop/start (more downtime, but simpler), you can do:

```bash
docker compose -f docker-compose.prod.yml down && \
  docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

Notes:

- Don’t add `-v` to `down` unless you intend to delete the persistent backend volume (your SQLite DB + secrets).
- Only add `--remove-orphans` if you previously ran a different Compose file for the same project name and need to remove old/renamed services.

# Installation

> [!CAUTION]
> This is a BETA deployment and production-readiness depends on deployment controls:
> use TLS, trusted reverse proxy, fixed secrets, backups, and endpoint rate limits.

> [!CAUTION]
> ExcaliDash is in BETA. Please backup your data regularly.

## Quickstart

Prereqs: Docker + Docker Compose v2.

<details>
<summary>Docker Hub (Recommended)</summary>

## Docker Hub (Recommended)

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/main/docker-compose.prod.yml

# Pull images
docker compose -f docker-compose.prod.yml pull

# Run container
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at localhost:6767
```

For single-container deployments, `JWT_SECRET` can be omitted and will be auto-generated and persisted in the backend volume on first start. For portability and most production deployments, set a fixed `JWT_SECRET` explicitly.

By default, the provided Compose files set `TRUST_PROXY=false` for safer setup. Only set `TRUST_PROXY` to a positive hop count (for example, `1`) when requests always pass through a trusted reverse proxy that correctly sets forwarded headers.

</details>

<details>
<summary>Docker Build</summary>

## Docker Build

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git

docker compose build
docker compose up -d

# Access the frontend at localhost:6767
```

</details>

<details>
<summary>Remote deployment without source code (custom images)</summary>

## Remote Deployment Without Source Code

Use this flow when the build machine has the repository, but the deployment host
must contain only Docker, Compose, configuration, and persistent data. The
application source code is included in the images; it is not copied to the
deployment host.

Build and tag immutable images on the build machine. Build for the same CPU
architecture as the deployment host.

```bash
export EXCALIDASH_TAG=0.5.1-custom.1

docker build -t excalidash-backend:$EXCALIDASH_TAG backend
docker build -f frontend/Dockerfile -t excalidash-frontend:$EXCALIDASH_TAG .
```

If you have a container registry, push the two tagged images and pull them on
the deployment host. Without a registry, transfer the images directly over SSH:

```bash
docker save \
  excalidash-backend:$EXCALIDASH_TAG \
  excalidash-frontend:$EXCALIDASH_TAG \
  | gzip -1 \
  | ssh deploy-host 'gzip -d | docker load'
```

Create the deployment directory and copy only the Compose file to the deployment
host:

```bash
ssh deploy-host 'mkdir -p /root/ExcaliDash'
scp docker-compose.prod.yml deploy-host:/root/ExcaliDash/docker-compose.yml
```

Edit the copied file as follows:

```yaml
services:
  backend:
    image: excalidash-backend:0.5.1-custom.1
    volumes:
      - ./data:/app/prisma

  frontend:
    image: excalidash-frontend:0.5.1-custom.1
```

Remove the top-level `volumes: backend-data:` declaration from that copied file.
The `./data` bind mount keeps the SQLite database and persisted secrets in
`/root/ExcaliDash/data`, which makes host-level backups straightforward.

Create `/root/ExcaliDash/.env` with permissions restricted to the deploy user:

```env
FRONTEND_URL=https://excalidash.example.com
AUTH_MODE=local
TRUST_PROXY=false
JWT_SECRET=replace-with-a-long-fixed-random-secret
CSRF_SECRET=replace-with-another-long-fixed-random-secret
# Optional: leave empty to disable AI/Text-to-Diagram without a Compose warning.
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=anthropic/claude-sonnet-4-6
```

Generate secrets with `openssl rand -hex 32` (JWT) and `openssl rand -base64 32`
(CSRF). `FRONTEND_URL` must exactly match the browser-facing URL, including its
protocol and port. If a trusted reverse proxy is in use, set `TRUST_PROXY` to
the correct positive hop count.

Start the deployment:

```bash
cd /root/ExcaliDash
mkdir -p data
chmod 600 .env
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
```

For a later release, build and transfer/pull new immutable image tags, update
both `image:` values in the host Compose file, then run `docker compose up -d`
again. Do not run `docker compose pull` when using images transferred with
`docker load` and local-only image names.

Back up the application data by briefly stopping the backend, archiving the
`data` directory, then starting it again. This avoids copying a SQLite database
while it is being written:

```bash
cd /root/ExcaliDash
docker compose stop backend
tar -C . -czf excalidash-data-$(date +%F).tar.gz data
docker compose up -d backend
```

If your host runs a standalone Compose V2 binary under another name, substitute
that command for `docker compose` in the commands above.

</details>

## Advanced

The root README keeps the install path short. See
[advanced deployment and operations](docs/DEPLOYMENT.md) for reverse proxy,
auth/OIDC, database provider, offline, backup, password policy, and operational
details.

For release-candidate validation across multiple local configurations, see the
[configuration lab](docs/CONFIG_LAB.md).

# Development

For contributor workflow, `make dev` starts the app in local single-user mode so you can reproduce editor bugs without going through login/onboarding. Use `make dev-auth` if you need to test local auth or OIDC flows from your `backend/.env`.

<details>
<summary>Clone the Repository</summary>

## Clone the Repository

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git
```

</details>

<details>
<summary>Frontend</summary>

## Frontend

```bash
cd ExcaliDash/frontend
npm install

# Copy environment file and customize if needed
cp .env.example .env

npm run dev
```

</details>

<details>
<summary>Backend</summary>

## Backend

```bash
cd ExcaliDash/backend
npm install

# Copy environment file and customize if needed
cp .env.example .env

# Generate Prisma client and setup database
npx prisma generate
npx prisma db push

npm run dev
```

</details>

<details>
<summary>Simulate Auth Onboarding (Development)</summary>

### Simulate Auth Onboarding (Development)

To simulate first-run authentication choice flows in local development:

```bash
cd ExcaliDash/backend

# Preview what would change (no data modifications)
npm run dev:simulate-auth-onboarding:dry-run

# Simulate "fresh install" onboarding state
# (wipes drawings/collections/libraries and removes non-bootstrap users)
npm run dev:simulate-auth-onboarding:fresh

# Simulate "migration" onboarding state (ensures legacy data exists)
npm run dev:simulate-auth-onboarding:migration
```

After running a simulation while the backend is already running, wait about 5 seconds
(auth mode cache TTL) or restart the backend before refreshing the UI.

</details>

<details>
<summary>Setup and Operational Scripts</summary>

### Setup and Operational Scripts

In `backend/package.json` there are helper scripts for maintenance:

| Script          | Purpose                                    |
| --------------- | ------------------------------------------ |
| `admin:recover` | Emergency admin credential recovery/reset. |

Admin recovery example:

```bash
cd backend
npm run admin:recover -- --identifier admin@example.com --generate --activate --must-reset
```

Common flags:

| Flag                          | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `--password "<new-password>"` | Set explicit new password.                               |
| `--generate`                  | Generate a secure random password.                       |
| `--activate`                  | Activate the admin account immediately.                  |
| `--promote`                   | Promote user to admin role.                              |
| `--must-reset`                | Force password reset on first login.                     |
| `--disable-login-rate-limit`  | Temporarily disable login throttling for this operation. |

</details>

# Credits
If you find ExcaliDash useful, please consider [sponsoring](https://github.com/sponsors/ZimengXiong)
- Example designs from:
  - <https://github.com/Prakash-sa/system-design-ultimatum/tree/main>
  - <https://github.com/kitsteam/excalidraw-examples/tree/main>
- [The amazing work of Excalidraw & contributors](https://www.npmjs.com/package/@excalidraw/excalidraw)
