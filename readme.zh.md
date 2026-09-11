# DbGate Helm Chart

[English](README.md)

此 Chart 在 Kubernetes 中以单副本部署 DbGate。发布到 Helm 仓库后，可以通过
Rancher Apps 安装，也可以直接使用 Helm 安装。

## 安装

安装时提供管理员密码，请勿将真实密码提交到 `values.yaml`。

### 在线安装

添加公共 Helm 仓库并安装 Chart：

```bash
helm repo add dbgate https://cn-helm.github.io/dbgate
helm repo update
helm upgrade --install dbgate dbgate/dbgate \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password'
```

### 本地安装

在 Chart 目录下执行：

```bash
helm upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password'
```

如果需要指定本地 kubeconfig 和 Ingress 主机名，可在本地安装命令中添加以下选项
（按实际位置调整 kubeconfig 路径）：

```bash
helm --kubeconfig ./rancher-local.yaml upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password' \
  --set ingress.enabled=true \
  --set 'ingress.hosts[0].host=dbgate.localhost' \
  --set 'ingress.hosts[0].paths[0].path=/dbgate' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

如果使用已有的 Secret，设置 `auth.existingSecret`。Secret 必须同时包含
`LOGIN_PASSWORD_admin` 和 `LOGIN_PERMISSIONS_admin` 两个键。

## 发布为 Rancher HTTP 仓库

将 Chart 推送到 `main` 分支后，GitHub Actions 工作流会打包 Chart、生成
`index.yaml`，并发布到 `gh-pages` 分支。在 GitHub 仓库设置中启用 **Pages**，
选择 `gh-pages` 分支作为来源。首次工作流成功后，在 Rancher 的
**Apps > Repositories** 中添加以下地址，类型选择 **HTTP**：

```text
https://cn-helm.github.io/dbgate
```

不要在地址末尾添加 `Chart.yaml` 或 `index.yaml`：Rancher 会自动从仓库根目录
读取 `index.yaml`。随后可在 **Apps > Charts** 中找到 `dbgate`，并在 Rancher
参数表单中填写 `auth.adminPassword`。每次发布新版本 Chart 时，需要增加
`Chart.yaml` 中的 `version`，以便 Helm 和 Rancher 识别更新。

工作流还会将英文 README 渲染为首页，将 `readme.zh.md` 渲染为中文页面，并提供
语言切换导航。文档改动也会触发发布。站点会保留 `index.yaml` 和历史 Chart 压缩包，
因此同一地址既能浏览文档，也能供 Helm 客户端使用。

- English：https://cn-helm.github.io/dbgate/
- 简体中文：https://cn-helm.github.io/dbgate/readme.zh.html

## Rancher Service Proxy

Service 与 LibreDB Studio 采用相同结构：对外提供 HTTP 端口 `80`，转发到
DbGate 容器的 `3000` 端口。在 `tools` 命名空间安装名为 `dbgate` 的 release 后，
Rancher 提供以下代理地址：

```text
https://localhost/api/v1/namespaces/tools/services/http:dbgate:80/proxy/
```

DbGate 在首次请求后使用 Bearer 认证登录，这种方式通过 Rancher 自带认证的
Service Proxy 访问时不够可靠。请使用下面的默认 Ingress 入口。

## Rancher HTTPS 子路径

将 Rancher 的宿主机端口迁移至 `8443`，并由 ingress-nginx 使用宿主机端口 `443`
后，Chart 默认配置会通过共享的 HTTPS 入口提供 DbGate：

```bash
helm upgrade --install dbgate . \
  --namespace tools --create-namespace \
  --set auth.adminPassword='replace-with-a-strong-password'
```

访问 `https://<rancher-host-or-lan-ip>/dbgate/`，注意保留末尾的斜杠。
默认配置不生成 `spec.rules[].host`，因此 Ingress 可接受 `localhost`、局域网 IP
或域名。`WEB_ROOT=/dbgate` 使资源与登录请求都位于此 Ingress 路径前缀下。
为所使用的主机名或 IP 配置受信任的 TLS 证书，可消除浏览器证书警告。

## 持久化

设置 `persistence.enabled=true`，可持久保存 `/root/.dbgate` 下的本地数据。
请确保目标集群具有默认 StorageClass，或通过 `persistence.storageClass` 显式指定。
