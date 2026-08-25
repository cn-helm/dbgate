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
  --set auth.adminPassword='replace-with-a-strong-password' \
  --set ingress.enabled=true \
  --set-string 'ingress.hosts[0].host=dbgate.localhost'
```

For an existing Secret, set `auth.existingSecret`. It must contain both
`LOGIN_PASSWORD_admin` and `LOGIN_PERMISSIONS_admin` keys.

## Rancher

Package and publish this directory to an HTTPS or Git-backed Helm repository,
then add that repository in **Apps > Repositories** and install the `dbgate`
chart from **Apps > Charts**. Enter `auth.adminPassword` in the Rancher values
form. Enable the Ingress only after an `nginx` IngressClass/controller is ready.

## Persistence

Set `persistence.enabled=true` to retain DbGate's local data under
`/root/.dbgate`. Make sure the target cluster has a default StorageClass, or set
`persistence.storageClass` explicitly.
