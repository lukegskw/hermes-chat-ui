# Installation and updates

[Back to the README](../README.md) · [Phone access](mobile.md)

## Compatibility

Use Docker Engine with Compose v2. Builds from this revision publish the UI for
`linux/amd64` and `linux/arm64`. The `latest` manifest inspected before this
change on 2026-09-05 contained only amd64; older tags can remain single-platform.
On an unsupported architecture, select a compatible tag or use a
[source build](#build-from-source).

Hermes must already be able to answer a message with your chosen model. Its
`GET /v1/capabilities` response must include these `features` set to `true`:

```text
session_resources
session_chat
session_chat_streaming
model_options
session_model_lock
```

The response must also advertise endpoint paths for `sessions`, `session_create`,
`session_delete`, `session_messages`, `session_chat_stream`, `model_options`, and
`session_model_lock`. The UI uses `/api/sessions` and `/api/model/options`; an
OpenAI-compatible `/v1/chat/completions` endpoint alone is insufficient.

The Hermes image pinned in the optional Compose is Hermes **0.21.0** at digest
`sha256:5d8b173e746ab53d0cbad44c1ea4c6d048f2d3a17ff5af1af0ae3033d29cb1b4`.
On 2026-09-05 it passed the read-only diagnostic plus session creation, streamed
chat, canonical history, and deletion through the UI on arm64. The chat test used
a disposable local OpenAI-compatible model fixture, so it verifies the client
contract without certifying an external model provider. Newer Hermes versions
should be checked with the command below because this API can evolve. See the
[official API documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/).

## Existing Hermes in Docker

Download the UI Compose and `.env` using the [README quick start](../README.md#start-with-your-existing-hermes).
Keep your existing Hermes service and its data mounts.

The Hermes container needs these environment values (use your actual key):

```yaml
environment:
  API_SERVER_ENABLED: "true"
  API_SERVER_HOST: 0.0.0.0
  API_SERVER_PORT: "8642"
  API_SERVER_KEY: ${API_SERVER_KEY}
```

Create a network once, if it does not already exist:

```bash
docker network inspect hermes-internal >/dev/null 2>&1 || docker network create hermes-internal
```

Merge this network configuration into your **existing Hermes Compose**, keeping
its other networks. Replace `hermes-agent` with your actual service name:

```yaml
services:
  hermes-agent:
    networks:
      - hermes-internal

networks:
  hermes-internal:
    external: true
    name: hermes-internal
```

Recreate your Hermes service using its existing Compose project after changing
its environment/network. Alternatively, `docker network connect hermes-internal
<container-name>` joins an already-running container for a first trial; that
manual connection is lost when the container is replaced.

Set these values in the UI deployment's `.env`:

```dotenv
HERMES_API_URL=http://hermes-agent:8642
HERMES_NETWORK=hermes-internal
API_SERVER_KEY=your-existing-hermes-api-key
```

The hostname must match a service name or network alias on the shared network.
If your API listens on another container port, use that port in the URL. No API
host port needs to be published for communication on this Docker network.

```bash
docker compose -f docker-compose.ui.yml pull
docker compose -f docker-compose.ui.yml up -d
```

## Hermes outside Docker

`localhost` inside the UI container means the UI container itself.

| Hermes location  | Set `HERMES_API_URL` to                | Requirement                                                                     |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Same Docker host | `http://host.docker.internal:8642`     | Docker Desktop provides this hostname; on Linux add the mapping below           |
| Another server   | `http://your-private-hermes-host:8642` | That hostname/IP must be reachable from inside Docker over your private network |

For a Linux host, add this under `hermes-chat-ui` in the UI Compose:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Hermes must listen on an interface reachable from Docker; a Linux host service
bound only to `127.0.0.1` is not reachable through the bridge gateway. Restrict
access to its authenticated API to the UI host/network. For remote untrusted
network paths, use HTTPS or a VPN instead of plain HTTP.

The example UI still attaches to `HERMES_NETWORK`; create that Docker network
as above even when Hermes is outside Docker. Host VPN connectivity does not
always imply container VPN connectivity; use the connection check to verify it.

## New Hermes installation

Use this only for a new agent. The example uses `./hermes-data` for all Hermes
state, including its workspace. It does not import data from an existing NAS.

After downloading the UI files from the README, download the optional agent Compose:

```bash
curl -fSLo docker-compose.hermes-agent.yml https://raw.githubusercontent.com/lukegskw/hermes-chat-ui/main/docker-compose.hermes-agent.example.yml
openssl rand -hex 32
```

Put the generated value in `.env` as `API_SERVER_KEY`. Keep
`HERMES_API_URL=http://hermes-agent:8642` and select a compatible `HERMES_IMAGE`
if overriding the default candidate. Then initialize the model credentials using
the official image's setup wizard:

```bash
mkdir -p hermes-data
docker compose -f docker-compose.hermes-agent.yml pull
docker compose -f docker-compose.hermes-agent.yml run --rm hermes-agent setup
docker compose -f docker-compose.hermes-agent.yml up -d
docker compose -f docker-compose.ui.yml pull
docker compose -f docker-compose.ui.yml up -d
```

If you change `HERMES_DATA_DIR`, create that directory instead. Hermes stores
model credentials in its own data directory; the UI `.env` does not need your
model-provider keys. The setup and `gateway run` commands follow the
[official Docker workflow](https://hermes-agent.nousresearch.com/docs/user-guide/docker/).

The dashboard is disabled initially. To enable it later, set
`HERMES_DASHBOARD=1`, configure its username/password and stable signing secret
in `.env`, and recreate the agent container. It is then available on the Docker
host at `http://localhost:9119`. See [proactive automation](advanced.md#proactive-messages-from-hermes)
if you also want scheduled tasks to create notification conversations.

## Check the connection

This command runs **inside the UI container**, uses its configured API key, and
validates the exact capabilities, model catalog, and session-list response shapes
used by the browser. It prints no keys or conversations, creates no sessions,
and calls no model. Run it from the deployment directory:

```bash
docker compose -f docker-compose.ui.yml exec -T hermes-chat-ui \
  node /app/dist-server/check-hermes.js
```

All four lines should report `PASS`. Send a message in the UI to verify the
model and streaming; the command does not certify every API behavior. The UI's
`/api/health` endpoint reports only that the UI server is alive, not that Hermes
is ready.

| Result                           | What to check                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 401/403                     | The UI key must match the agent API key; recreate the UI after editing `.env`                                                                                             |
| HTTP 404 or missing capabilities | Select a Hermes image with the required Sessions API                                                                                                                      |
| Fetch failed or timeout          | Docker DNS/network, container-side API port, bind address, and firewall                                                                                                   |
| Read check passes but chat fails | Hermes model credentials, provider availability, and agent logs                                                                                                           |
| Image pull returns 401/403       | The package is public; stale GHCR credentials may interfere. Try `docker logout ghcr.io` if you no longer need that saved login, or use an anonymous Docker configuration |
| No matching manifest             | Use a tag for your CPU architecture or build from source                                                                                                                  |

UI logs are available with `docker compose -f docker-compose.ui.yml logs --tail=100`.
Review logs for private content before sharing them.

## Optional model-default configuration

Chat and model selection work without a Hermes filesystem mount. To display
reasoning defaults from your own `config.yaml`, download the optional overlay:

```bash
curl -fSLo docker-compose.ui.config.yml https://raw.githubusercontent.com/lukegskw/hermes-chat-ui/main/docker-compose.ui.config.example.yml
```

Set `HERMES_CONFIG_FILE` in `.env` to an existing absolute path on the Docker
host, readable by UID `10001`. Then use both files for future UI commands:

```bash
docker compose -f docker-compose.ui.yml -f docker-compose.ui.config.yml up -d
```

Only that file is mounted, read-only. The overlay refuses to create a directory
when the source file is missing. Without the mount, the displayed reasoning
default is the provider default, not necessarily your local Hermes override.

## Upgrade existing deployments

If you used the older NAS-specific examples, retain your existing Hermes state
mount and UI `/app/data` mount. Replacing a bind mount with a new named volume
does not migrate its data. In particular, retained images and push keys would
appear missing. Keep any existing configuration mount you depend on as well.

Keep your Compose project name/deployment directory stable: Docker named volumes
are project-scoped. The new examples bind to loopback, so an existing LAN URL
will also need the [HTTPS access setup](mobile.md) or an explicit private bind
address. Back up both data locations before migrating your deployment layout.

For ordinary UI image updates, wait for running tasks to finish, then:

```bash
docker compose -f docker-compose.ui.yml pull
docker compose -f docker-compose.ui.yml up -d
```

Use the overlay on both commands if enabled. Set `HERMES_UI_IMAGE` to a published
version tag or image digest to hold a known working release. `latest` follows
the default branch. Updates do not require `down -v`; that option deletes named
volumes. Reverting the UI image does not restore deleted Hermes sessions.

## Build from source

This path requires the whole repository and works on ARM when its dependencies
support the host architecture. It also lets you try unpublished changes:

```bash
git clone https://github.com/lukegskw/hermes-chat-ui.git
cd hermes-chat-ui
docker build -t hermes-chat-ui:local .
```

In your deployment `.env`, set `HERMES_UI_IMAGE=hermes-chat-ui:local`. Then, from
the deployment directory, start with `docker compose -f docker-compose.ui.yml
up -d --pull never`. The locally built image must be on the same Docker daemon
as that deployment. Skip the registry `pull` step for this local tag.
