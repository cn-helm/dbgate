const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const chart = path.resolve(__dirname, '..');

function render(values = [], { valid = true } = {}) {
  const args = ['template', 'rbac-test', chart, '--set', 'auth.existingSecret=test-auth'];
  for (const value of values) args.push('--set', value);
  const result = spawnSync('helm', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (valid) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, 'Expected invalid values to fail rendering');
  return valid ? result.stdout : result.stderr;
}

const databaseValues = [
  'rbac.database.server=database.example.internal',
  'rbac.existingSecret=rbac-credentials',
];

test('default preserves env permissions and web root, without SQL credentials', () => {
  const yaml = render();
  assert.match(yaml, /name: RBAC_STORAGE_ENGINE\s+value: "env"/);
  assert.match(yaml, /name: WEB_ROOT\s+value: "\/dbgate"/);
  assert.doesNotMatch(yaml, /name: RBAC_STORAGE_PASSWORD|name: RBAC_TOKEN_SECRET|name: RBAC_BOOTSTRAP_LOGIN/);
});

for (const [engine, port] of [['postgres', 5432], ['mysql', 3306]]) {
  test(`${engine} renders database configuration with Secret references`, () => {
    const yaml = render([`rbac.engine=${engine}`, ...databaseValues, 'rbac.database.ssl=true', 'web.root=']);
    assert.match(yaml, new RegExp(`name: RBAC_STORAGE_ENGINE\\s+value: "${engine}"`));
    assert.match(yaml, new RegExp(`name: RBAC_STORAGE_PORT\\s+value: "${port}"`));
    assert.match(yaml, /name: RBAC_STORAGE_SSL\s+value: "true"/);
    assert.match(yaml, /name: RBAC_STORAGE_PASSWORD\s+valueFrom:\s+secretKeyRef:\s+name: "rbac-credentials"\s+key: RBAC_STORAGE_PASSWORD/);
    assert.match(yaml, /name: RBAC_TOKEN_SECRET\s+valueFrom:\s+secretKeyRef:\s+name: "rbac-credentials"\s+key: RBAC_TOKEN_SECRET/);
    assert.doesNotMatch(yaml, /name: WEB_ROOT|name: RBAC_STORAGE_FILE/);
  });
}

test('custom port and retired bootstrap configuration', () => {
  const yaml = render(['rbac.engine=postgres', ...databaseValues, 'rbac.database.port=55432', 'rbac.bootstrap.login=']);
  assert.match(yaml, /name: RBAC_STORAGE_PORT\s+value: "55432"/);
  assert.doesNotMatch(yaml, /name: RBAC_BOOTSTRAP_LOGIN|name: RBAC_BOOTSTRAP_PROVIDER/);
});

test('SQLite uses the PVC, Recreate and no database password', () => {
  const yaml = render(['rbac.engine=sqlite']);
  assert.match(yaml, /strategy:\s+type: Recreate/);
  assert.match(yaml, /name: RBAC_STORAGE_FILE\s+value: "\/root\/\.dbgate\/rbac.sqlite"/);
  assert.match(yaml, /mountPath: \/root\/\.dbgate/);
  assert.match(yaml, /kind: PersistentVolumeClaim/);
  assert.doesNotMatch(yaml, /name: RBAC_STORAGE_PASSWORD|name: RBAC_TOKEN_SECRET/);
});

test('SQLite can reference a persistent JWT secret', () => {
  const yaml = render(['rbac.engine=sqlite', 'rbac.existingSecret=sqlite-signing-key']);
  assert.match(yaml, /name: "sqlite-signing-key"\s+key: RBAC_TOKEN_SECRET/);
});

test('OAuth bootstrap follows auth.provider and uses the authentication Secret', () => {
  const yaml = render(['rbac.engine=sqlite', 'auth.provider=oauth', 'rbac.bootstrap.login=admin@example.com']);
  assert.match(yaml, /name: AUTH_PROVIDER\s+value: "oauth"/);
  assert.match(yaml, /name: RBAC_BOOTSTRAP_PROVIDER\s+value: "oauth"/);
  assert.match(yaml, /name: RBAC_BOOTSTRAP_LOGIN\s+value: "admin@example.com"/);
  assert.doesNotMatch(yaml, /kind: Secret/);
});

test('chart-generated login Secret still works', () => {
  const yaml = render(['auth.existingSecret=', 'auth.adminPassword=test-placeholder-only']);
  assert.match(yaml, /LOGIN_PASSWORD_admin: "test-placeholder-only"/);
  assert.match(yaml, /LOGIN_PERMISSIONS_admin: "\*"/);
});

for (const [name, values] of [
  ['unknown engine', ['rbac.engine=unknown']],
  ['SQL missing secret', ['rbac.engine=postgres', 'rbac.database.server=database']],
  ['SQL missing server', ['rbac.engine=mysql', 'rbac.existingSecret=credentials']],
  ['SQLite replicas', ['rbac.engine=sqlite', 'replicaCount=2']],
  ['SQLite without persistence', ['rbac.engine=sqlite', 'persistence.enabled=false']],
  ['SQLite relative file', ['rbac.engine=sqlite', 'rbac.sqlite.file=rbac.sqlite']],
  ['SQLite served file', ['rbac.engine=sqlite', 'rbac.sqlite.file=/root/.dbgate/files/rbac.sqlite']],
  ['SQLite path traversal', ['rbac.engine=sqlite', 'rbac.sqlite.file=/root/.dbgate/../rbac.sqlite']],
  ['provider mismatch', ['rbac.engine=sqlite', 'rbac.bootstrap.provider=oauth']],
  ['OAuth without Secret', ['auth.provider=oauth', 'auth.existingSecret=']],
  ['port out of range', ['rbac.engine=postgres', ...databaseValues, 'rbac.database.port=65536']],
  ['non-numeric port', ['rbac.engine=postgres', ...databaseValues, 'rbac.database.port=invalid']],
]) {
  test(`rejects ${name}`, () => render(values, { valid: false }));
}
