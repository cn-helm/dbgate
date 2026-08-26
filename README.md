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
