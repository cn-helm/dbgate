{{- define "dbgate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "dbgate.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := include "dbgate.name" . }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "dbgate.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "dbgate.labels" -}}
helm.sh/chart: {{ include "dbgate.chart" . }}
{{ include "dbgate.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "dbgate.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dbgate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "dbgate.authSecretName" -}}
{{- default (printf "%s-auth" (include "dbgate.fullname" .)) .Values.auth.existingSecret }}
{{- end }}

{{- define "dbgate.validateRbac" -}}
{{- $engine := .Values.rbac.engine -}}
{{- if not (has $engine (list "env" "postgres" "mysql" "sqlite")) -}}
{{- fail "rbac.engine must be env, postgres, mysql or sqlite" -}}
{{- end -}}
{{- if not (has .Values.auth.provider (list "logins" "oauth" "ad")) -}}
{{- fail "auth.provider must be logins, oauth or ad" -}}
{{- end -}}
{{- if and (ne .Values.auth.provider "logins") (empty .Values.auth.existingSecret) -}}
{{- fail "OAuth/AD require auth.existingSecret with identity provider configuration" -}}
{{- end -}}
{{- if ne $engine "env" -}}
{{- if and .Values.rbac.bootstrap.login .Values.rbac.bootstrap.provider (ne .Values.rbac.bootstrap.provider .Values.auth.provider) -}}
{{- fail "rbac.bootstrap.provider must match auth.provider" -}}
{{- end -}}
{{- if has $engine (list "postgres" "mysql") -}}
{{- if or (empty .Values.rbac.database.server) (empty .Values.rbac.database.name) (empty .Values.rbac.database.user) (empty .Values.rbac.existingSecret) -}}
{{- fail "PG/MySQL RBAC requires rbac.database.server/name/user and rbac.existingSecret" -}}
{{- end -}}
{{- $port := int .Values.rbac.database.port -}}
{{- if or (lt $port 0) (gt $port 65535) -}}
{{- fail "rbac.database.port must be 0 (default) or 1 through 65535" -}}
{{- end -}}
{{- end -}}
{{- if eq $engine "sqlite" -}}
{{- if or (ne (int .Values.replicaCount) 1) (not .Values.persistence.enabled) -}}
{{- fail "SQLite RBAC requires replicaCount=1 and persistence.enabled=true" -}}
{{- end -}}
{{- $file := .Values.rbac.sqlite.file -}}
{{- if or (ne (dir $file) "/root/.dbgate") (ne (clean $file) $file) (eq (base $file) ".dbgate") -}}
{{- fail "rbac.sqlite.file must be a file directly under /root/.dbgate" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
