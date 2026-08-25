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

## Rancher

Package and publish this directory to an HTTPS or Git-backed Helm repository,
then add that repository in **Apps > Repositories** and install the `dbgate`
 chart from **Apps > Charts**. Enter `auth.adminPassword` in the Rancher values
 form.

## Rancher Service Proxy

The Service follows the same structure as LibreDB Studio: it exposes HTTP port
`80` and forwards it to DbGate's container port `3000`. With a `dbgate` release
in the `tools` namespace, Rancher exposes:

```text
https://localhost/api/v1/namespaces/tools/services/http:dbgate:80/proxy/
```

Keep `ingress.enabled=false` when using this access method. To use an Ingress
instead, enable the Ingress and configure its host.

## Persistence

Set `persistence.enabled=true` to retain DbGate's local data under
`/root/.dbgate`. Make sure the target cluster has a default StorageClass, or set
`persistence.storageClass` explicitly.
