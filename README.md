# DbGate Helm Chart

This chart deploys DbGate as a single-replica Kubernetes workload. It is suitable
for installation from Rancher Apps after the chart directory is published to a
Helm repository, or directly with Helm.

## Install

Provide the administrator password at install time; do not commit it to
`values.yaml`.

```bash
helm upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password'
```

For an existing Secret, set `auth.existingSecret`. It must contain both
`LOGIN_PASSWORD_admin` and `LOGIN_PERMISSIONS_admin` keys.

## Publish as a Rancher HTTP Repository

Pushing this Chart to the `main` branch runs the GitHub Actions workflow that
packages it, generates `index.yaml`, and publishes both to `gh-pages`. In the
GitHub repository settings, enable **Pages** and select the `gh-pages` branch
as its source. After the first successful workflow, add this URL in Rancher
under **Apps > Repositories** with type **HTTP**:

```text
https://cn00.github.io/dbgate-helm
```

Do not append `Chart.yaml` or `index.yaml`: Rancher resolves `index.yaml` from
the repository root. It will then show the `dbgate` Chart in **Apps > Charts**.
Enter `auth.adminPassword` in the Rancher values form. Bump `Chart.yaml`'s
`version` for every Chart release so Helm and Rancher detect the update.

## Rancher Service Proxy

The Service follows the same structure as LibreDB Studio: it exposes HTTP port
`80` and forwards it to DbGate's container port `3000`. With a `dbgate` release
in the `tools` namespace, Rancher exposes:

```text
https://localhost/api/v1/namespaces/tools/services/http:dbgate:80/proxy/
```

DbGate login uses bearer authentication after the initial request, which does
not work reliably through Rancher's authenticated Service Proxy. Use the
default Ingress endpoint below instead.

## Rancher HTTPS subpath

After Rancher is moved to host port `8443` and ingress-nginx owns host port
`443`, the default Chart values serve DbGate from the shared HTTPS endpoint:

```bash
helm upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password'
```

Open `https://<rancher-host-or-lan-ip>/dbgate/` (including the trailing slash).
The default values intentionally omit `spec.rules[].host`, so the Ingress accepts
`localhost`, a LAN IP, or a DNS name. It sets `WEB_ROOT=/dbgate`, so DbGate
keeps its resources and login requests below the Ingress prefix. Configure a
trusted TLS certificate for the hostname or IP you use to remove the browser
certificate warning.

## Persistence

Set `persistence.enabled=true` to retain DbGate's local data under
`/root/.dbgate`. Make sure the target cluster has a default StorageClass, or set
`persistence.storageClass` explicitly.

## Chart 0.1.2: RBAC storage

Version 0.1.2 adds environment-variable configuration for PostgreSQL, MySQL and
SQLite RBAC storage. `rbac.engine=env` is the default and preserves the existing
environment-based permissions. The chart version does not upgrade the application
code: choose an explicit `image.tag` whose image includes the RBAC storage
implementation before enabling a database engine. `appVersion` alone is not a
feature check, and `latest` does not guarantee that RBAC support is present.

This is the storage-layer integration. The application management UI and complete
endpoint authorization audit remain pending; table/file rule storage is not yet a
complete fine-grained security boundary. Dynamic RBAC currently rejects MCP.

| Value | Default | Application setting / purpose |
| --- | --- | --- |
| `auth.provider` | `logins` | `AUTH_PROVIDER`; supports `logins`, `oauth`, `ad` |
| `rbac.engine` | `env` | `RBAC_STORAGE_ENGINE`: `env`, `postgres`, `mysql`, `sqlite` |
| `rbac.existingSecret` | empty | Secret holding the RBAC database password and/or JWT signing secret |
| `rbac.bootstrap.provider` | empty | `RBAC_BOOTSTRAP_PROVIDER`; defaults to `auth.provider` |
| `rbac.bootstrap.login` | `admin` | `RBAC_BOOTSTRAP_LOGIN`; first superadmin identity |
| `rbac.database.server` | empty | `RBAC_STORAGE_SERVER`; required for PG/MySQL |
| `rbac.database.port` | `0` | `RBAC_STORAGE_PORT`; 0 selects 5432 for PG or 3306 for MySQL |
| `rbac.database.name` | `dbgate_rbac` | `RBAC_STORAGE_DATABASE`; database must already exist |
| `rbac.database.user` | `dbgate_rbac` | `RBAC_STORAGE_USER` |
| `rbac.database.ssl` | `false` | `RBAC_STORAGE_SSL`; true enables verified TLS |
| `rbac.sqlite.file` | `/root/.dbgate/rbac.sqlite` | `RBAC_STORAGE_FILE`; directly under the data-volume mount |

### PostgreSQL and MySQL

Create the database and a user able to initialize/migrate the `rbac_` tables.
Provision these Secrets in the release namespace through your secret-management
workflow; the names below are examples:

| Secret | Required keys |
| --- | --- |
| `dbgate-auth` (logins) | `LOGIN_PASSWORD_admin`, `LOGIN_PERMISSIONS_admin` (`*` for legacy compatibility) |
| `dbgate-rbac` (PG/MySQL) | `RBAC_STORAGE_PASSWORD`, `RBAC_TOKEN_SECRET` |

`RBAC_TOKEN_SECRET` must be randomly generated, at least 32 characters long, and
identical across replicas. The chart uses explicit `secretKeyRef` entries for the
database password and signing secret; neither is supplied through a plain value.
Helm cannot verify the contents of existing Secrets while rendering offline;
Kubernetes/application startup validates the referenced keys and configuration.

Example `rbac-values.yaml` (replace the image tag and server):

```yaml
image:
  tag: "<rbac-enabled-image-tag>"
auth:
  provider: logins
  existingSecret: dbgate-auth
rbac:
  engine: postgres
  existingSecret: dbgate-rbac
  database:
    server: postgres.database.svc.cluster.local
    name: dbgate_rbac
    user: dbgate_rbac
    ssl: true
  bootstrap:
    login: admin
```

For MySQL, set `rbac.engine=mysql` and change `rbac.database.server`; port 0 selects
3306 automatically. Configure TLS to match the actual database deployment.

```bash
helm upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --values rbac-values.yaml
```

Database connection/migration failures prevent the application from starting;
they never trigger a fallback to SQLite. Centralized RBAC supports shared policy
across instances, but scaling the application still requires reviewing its local
data, session behavior and PVC access mode. The chart defaults to one replica;
a shared `ReadWriteOnce` PVC does not provide multi-node shared storage.

### SQLite

```yaml
image:
  tag: "<rbac-enabled-image-tag>"
replicaCount: 1
auth:
  existingSecret: dbgate-auth
rbac:
  engine: sqlite
  sqlite:
    file: /root/.dbgate/rbac.sqlite
persistence:
  enabled: true
```

The file is retained on the existing PVC. The chart requires a file directly under
`/root/.dbgate`, persistence enabled and exactly one replica. It renders deployment
strategy `Recreate` to avoid overlapping old/new pods during an upgrade; expect a
brief interruption. Choose a StorageClass backed by local/block storage, not
SMB/NFS. The chart cannot determine the backing filesystem of an external
StorageClass. The application enables WAL, foreign keys and a 5-second lock wait.

Optionally set `rbac.existingSecret` to a Secret containing `RBAC_TOKEN_SECRET`
to retain JWT validity across restarts. SQLite does not need a database-password
key. Without a persistent signing secret, users sign in again after restart.

### Authentication, bootstrap and upgrades

Authentication remains separate from stored authorization. Generated auth Secrets
configure the `admin` login; use `auth.existingSecret` for other accounts or IdPs.
With `auth.provider=oauth`, the authentication Secret should contain `OAUTH_AUTH`,
`OAUTH_TOKEN`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_SCOPE` and a stable
unique `OAUTH_LOGIN_FIELD`. Set `rbac.bootstrap.login` to the actual external login
(for example, `admin@example.com`); leave `rbac.bootstrap.provider` empty to inherit
`oauth`. AD similarly requires its existing `AD_*` configuration in that Secret.
The chart requires an existing authentication Secret for OAuth/AD.

Bootstrap only applies to an empty RBAC store and does not create an upstream IdP
account or reset existing privileges. After initialization, set
`rbac.bootstrap.login=""` to omit both bootstrap variables. An explicit bootstrap
provider must match `auth.provider`.

In dynamic mode, permissions come from RBAC storage; `LOGIN_PERMISSIONS_*` and
`PERMISSIONS` are ignored for authorization. Do not put `STORAGE_DATABASE` or
`SKIP_ALL_AUTH` into authentication Secrets: the application rejects those
combinations. Sign in again after switching from `env` to dynamic mode.
Secret updates require a pod restart to refresh environment variables; rotating
the JWT secret invalidates existing tokens. Back up the RBAC database before
migrations and preserve it during chart rollback. Changing engines does not
copy/migrate identities and permissions automatically.

### Validation and publishing

```bash
helm lint . --strict --set auth.existingSecret=lint-auth
node --test tests/rbac.test.cjs
```

The template tests cover all four engines, Secret references, OAuth bootstrap,
custom ports, and invalid SQLite/storage combinations without accessing a cluster
or database. The publishing workflow runs these checks before packaging. Local
`values2.yaml` and tests are excluded from the packaged chart. Publishing still
occurs through the existing `main` -> `gh-pages` workflow; local version changes
alone do not publish a release.
