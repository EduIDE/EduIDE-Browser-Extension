const test = require('node:test');
const assert = require('node:assert/strict');
const EduIDE = require('../src/lib/eduide.js');

const settings = (overrides = {}) => ({ ...EduIDE.DEFAULT_SETTINGS, ...overrides });
const params = (url) => Object.fromEntries(new URL(url).searchParams);

test('repoFromPath reads owner/repo and skips GitHub pages', () => {
    assert.equal(EduIDE.repoFromPath('/ccims/gropius-backend'), 'ccims/gropius-backend');
    assert.equal(EduIDE.repoFromPath('/ccims/gropius-backend/tree/main/api'), 'ccims/gropius-backend');
    assert.equal(EduIDE.repoFromPath('/octocat/hello.git'), 'octocat/hello');
    assert.equal(EduIDE.repoFromPath('/settings/profile'), undefined);
    assert.equal(EduIDE.repoFromPath('/orgs/ls1intum/repositories'), undefined);
    assert.equal(EduIDE.repoFromPath('/octocat'), undefined);
    assert.equal(EduIDE.repoFromPath('/'), undefined);
});

test('repoFromUrl keeps reading GitHub repositories', () => {
    assert.deepEqual(EduIDE.repoFromUrl('https://github.com/octocat/Hello-World/tree/main', {}), { host: 'github.com', nwo: 'octocat/Hello-World' });
    assert.equal(EduIDE.repoFromUrl('https://github.com/settings/profile', {}), undefined);
});

test('repoFromUrl reads GitLab projects, subgroups and refs', () => {
    assert.deepEqual(EduIDE.repoFromUrl('https://gitlab.com/group/sub/repo', {}), { host: 'gitlab.com', nwo: 'group/sub/repo', ref: undefined });
    assert.deepEqual(EduIDE.repoFromUrl('https://gitlab.com/group/sub/repo/-/tree/dev/src', {}), { host: 'gitlab.com', nwo: 'group/sub/repo', ref: 'dev' });
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/repo/-/blob/v1.0/README.md', {}).ref, 'v1.0');
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/repo/-/issues', {}).ref, undefined);
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/repo.git', {}).nwo, 'group/repo');
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/repo/-/tree/feature%2Fx', {}).ref, 'feature/x');
    // a slash in a ref cannot be told from a folder, so only the first segment counts
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/repo/-/tree/feature/x', {}).ref, 'feature');
});

test('repoFromUrl reads Gitea projects and refs', () => {
    const repo = (path) => EduIDE.repoFromUrl(`https://codeberg.org${path}`, {});
    assert.deepEqual(repo('/owner/repo'), { host: 'codeberg.org', nwo: 'owner/repo', ref: undefined });
    assert.equal(repo('/owner/repo/src/branch/main/docs').ref, 'main');
    assert.equal(repo('/owner/repo/src/tag/v2').ref, 'v2');
    assert.equal(repo('/owner/repo/src/commit/0123abc').ref, '0123abc');
    assert.equal(repo('/owner/repo/issues').ref, undefined);
    assert.equal(repo('/owner/repo/issues').nwo, 'owner/repo');
});

test('repoFromUrl returns nothing for other pages, hosts and schemes', () => {
    for (const url of [
        'https://gitlab.com/', 'https://gitlab.com/users/sign_in', 'https://gitlab.com/explore/projects', 'https://gitlab.com/groups/g/-/issues',
        'https://gitlab.com/-/profile', 'https://gitlab.com/group', 'https://codeberg.org/explore/repos', 'https://codeberg.org/user/login',
        'https://codeberg.org/owner', 'https://codeberg.org/alice/-/projects',
        'https://codeberg.org/attachments/0a1b2c3d-0000-4000-8000-000000000000', 'https://codeberg.org/avatars/abc', 'https://codeberg.org/.well-known/openid-configuration',
        'https://example.org/a/b', 'http://gitlab.com/a/b', 'not a url'
    ]) {
        assert.equal(EduIDE.repoFromUrl(url, {}), undefined, url);
    }
});

test('refs that git or the landing page would refuse are dropped', () => {
    const ref = (name) => EduIDE.repoFromUrl(`https://codeberg.org/o/r/src/branch/${name}`, {}).ref;
    assert.equal(ref('main'), 'main');
    for (const bad of ['-x', 'a..b', 'a@%7Bb', 'a%20b', 'a%0Ab', 'a%00b']) {
        assert.equal(ref(bad), undefined, bad);
    }
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/g/r/-/tree/--upload-pack', {}).ref, undefined);
});

test('gitlab pages without /-/ end the project path', () => {
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/group/project/activity', {}).nwo, 'group/project');
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/g/s/r/issues/3', {}).nwo, 'g/s/r');
});

test('host names such as constructor are not hosts', () => {
    assert.equal(EduIDE.repoFromUrl('https://constructor/a/b', {}), undefined);
});

test('configured hosts are read by their type', () => {
    const hosts = EduIDE.parseHosts('git.example.org gitlab\n\n Code.Example.org   gitea ');
    assert.deepEqual(hosts, { 'git.example.org': 'gitlab', 'code.example.org': 'gitea' });
    assert.equal(EduIDE.repoFromUrl('https://git.example.org:8443/a/b/c', { 'git.example.org:8443': 'gitlab' }).nwo, 'a/b/c');
    assert.equal(EduIDE.repoFromUrl('https://code.example.org/a/b/src/branch/x', hosts).ref, 'x');
    const defaultPort = EduIDE.parseHosts('git.example.org:443 gitlab');
    assert.deepEqual(defaultPort, { 'git.example.org': 'gitlab' });
    assert.equal(EduIDE.repoFromUrl('https://git.example.org:443/a/b', defaultPort).nwo, 'a/b');
    assert.throws(() => EduIDE.parseHosts('git.example.org:99999 gitea'), /not of the form/);
    assert.throws(() => EduIDE.parseHosts('git.example.org svn'), /not of the form/);
    assert.throws(() => EduIDE.parseHosts('https://git.example.org gitlab'), /not of the form/);
});

test('credentials in the tab address never reach the launch URL', () => {
    const repo = EduIDE.repoFromUrl('https://user:secret@gitlab.com/g/s/r/-/tree/main', {});
    const url = EduIDE.buildLaunchUrl(settings(), repo);
    assert.equal(params(url).gitUri, 'https://gitlab.com/g/s/r.git');
    assert.ok(!url.includes('secret') && !url.includes('user'));
    assert.equal(EduIDE.repoFromUrl('https://gitlab.com/g/user:secret@x', {}), undefined);
});

test('the launch URL names the host of the repository', () => {
    assert.equal(params(EduIDE.buildLaunchUrl(settings(), { host: 'gitlab.com', nwo: 'g/s/r' })).gitUri, 'https://gitlab.com/g/s/r.git');
    assert.equal(params(EduIDE.buildLaunchUrl(settings(), { host: 'codeberg.org', nwo: 'o/r', ref: 'dev' })).appDef, undefined);
    for (const facts of [{ host: 'gitlab.com', nwo: 'r' }, { host: 'gitlab.com', nwo: 'g/..' }, { host: 'a/b', nwo: 'g/r' }]) {
        assert.throws(() => EduIDE.buildLaunchUrl(settings(), facts), /not a repository/);
    }
});

test('parseArchiveRef follows the Download ZIP link', () => {
    assert.equal(EduIDE.parseArchiveRef('/o/r/archive/refs/heads/main.zip'), 'main');
    assert.equal(EduIDE.parseArchiveRef('/o/r/archive/refs/heads/feature/login-form.zip'), 'feature/login-form');
    assert.equal(EduIDE.parseArchiveRef('/o/r/archive/refs/tags/v1.2.0.zip'), 'v1.2.0');
    assert.equal(EduIDE.parseArchiveRef('/o/r/archive/0123abc.zip'), '0123abc');
    assert.equal(EduIDE.parseArchiveRef('/o/r/releases'), undefined);
    assert.equal(EduIDE.parseArchiveRef(undefined), undefined);
});

test('parseLanguageLabel strips the percentage and ignores Other', () => {
    assert.equal(EduIDE.parseLanguageLabel('Kotlin99.8%'), 'Kotlin');
    assert.equal(EduIDE.parseLanguageLabel('\n  C++\n  12.5%\n'), 'C++');
    assert.equal(EduIDE.parseLanguageLabel('Jupyter Notebook 3 %'), 'Jupyter Notebook');
    assert.equal(EduIDE.parseLanguageLabel('Other0.2%'), undefined);
    assert.equal(EduIDE.parseLanguageLabel(''), undefined);
});

test('the TUM launch URL preselects the image and clones over HTTPS', () => {
    const url = EduIDE.buildLaunchUrl(settings(), { nwo: 'octocat/Hello-World', language: 'Java', ref: 'main' });
    assert.equal(new URL(url).origin, 'https://eduide.artemis.cit.tum.de');
    assert.deepEqual(params(url), {
        appDef: 'java-17-latest',
        gitUri: 'https://github.com/octocat/Hello-World.git'
    });
});

test('an unmapped language leaves the choice to the landing page', () => {
    const url = EduIDE.buildLaunchUrl(settings(), { nwo: 'golang/example', language: 'Go' });
    assert.equal(params(url).appDef, undefined);
    assert.equal(params(url).gitUri, 'https://github.com/golang/example.git');
});

test('each installation only preselects apps it offers', () => {
    const facts = { nwo: 'o/r', language: 'Java' };
    assert.equal(params(EduIDE.buildLaunchUrl(settings({ installation: 'bonn' }), facts)).appDef, undefined);
    assert.equal(params(EduIDE.buildLaunchUrl(settings({ installation: 'bonn' }), { ...facts, language: 'TypeScript' })).appDef, 'javascript-latest');
    assert.equal(params(EduIDE.buildLaunchUrl(settings({ installation: 'mannheim' }), facts)).appDef, undefined);
    assert.ok(EduIDE.buildLaunchUrl(settings({ installation: 'local' }), facts).startsWith('http://localhost:3100/?'));
    const cluster = EduIDE.buildLaunchUrl(settings({ installation: 'cluster' }), facts);
    assert.ok(cluster.startsWith('https://eduide.localhost/?'));
    assert.equal(params(cluster).appDef, 'java-17-latest');
});

test('overrides add and remove mappings', () => {
    const custom = settings({ overrides: { Kotlin: '', Go: 'java-17-latest' } });
    assert.equal(EduIDE.appDefFor(custom, 'Kotlin'), undefined);
    assert.equal(EduIDE.appDefFor(custom, 'Go'), 'java-17-latest');
    assert.equal(EduIDE.appDefFor(custom, 'Java'), 'java-17-latest');
    assert.equal(EduIDE.appDefFor(custom, undefined), undefined);
});

test('gitRef is sent only when enabled', () => {
    const facts = { nwo: 'o/r', ref: 'feature/x' };
    assert.equal(params(EduIDE.buildLaunchUrl(settings(), facts)).gitRef, undefined);
    assert.equal(params(EduIDE.buildLaunchUrl(settings({ sendRef: true }), facts)).gitRef, 'feature/x');
});

test('custom installations need a valid http(s) address', () => {
    const facts = { nwo: 'o/r' };
    assert.throws(() => EduIDE.buildLaunchUrl(settings({ installation: 'custom' }), facts), /No EduIDE address/);
    assert.throws(() => EduIDE.buildLaunchUrl(settings({ installation: 'custom', customUrl: 'not a url' }), facts), /not a valid/);
    assert.throws(() => EduIDE.buildLaunchUrl(settings({ installation: 'custom', customUrl: 'javascript:alert(1)' }), facts), /must start with/);
    const url = EduIDE.buildLaunchUrl(settings({ installation: 'custom', customUrl: 'https://ide.example.org/start' }), facts);
    assert.ok(url.startsWith('https://ide.example.org/start?'));
});

test('a missing installation means TUM, an unknown one is an error rather than a silent TUM', () => {
    assert.equal(EduIDE.resolveInstallation(settings({ installation: undefined })).id, 'tum');
    assert.equal(EduIDE.resolveInstallation(settings({ installation: 'from-a-newer-version' })).unknown, true);
    assert.throws(
        () => EduIDE.buildLaunchUrl(settings({ installation: 'from-a-newer-version' }), { nwo: 'o/r' }),
        /does not know the EduIDE "from-a-newer-version".*Reload the extension/
    );
});

test('nothing but a plain owner/repo reaches gitUri', () => {
    for (const nwo of [undefined, '', 'o', 'o/r/x', 'o/..', 'o/r?x=1', 'o/r#x', 'user:token@o/r']) {
        assert.throws(() => EduIDE.buildLaunchUrl(settings(), { nwo }), /not a repository/, String(nwo));
    }
});

// Shape of a chart-rendered /config.js (trimmed from TUM's, 22 Oct 2026).
const TUM_CONFIG = `window.theiaCloudConfig = {
  serviceAuthToken: "nJV3nKZmpxTD4wu2",
  appName: "Artemis Online IDE",
  additionalApps: [
    {
      serviceAuthToken: "c-latest",
      appName: "C",
      visible: false,
    },
    {
      serviceAuthToken: "c-templates-latest",
      appName: "C",
      buildSystems: [
        { id: "bazel", label: "Bazel" },
      ],
    },
    {
      serviceAuthToken: "java-17-templates-latest",
      appName: "Java 17",
    },
    {
      serviceAuthToken: "java-17-latest",
      appName: "Java 17",
      visible: false,
    },
    {
      serviceAuthToken: "python-latest",
      appName: "Python",
    },
  ],
  logoFileExtension: "png",
};`;

test('parseLandingConfig reads the app list and nothing else', () => {
    assert.deepEqual(EduIDE.parseLandingConfig(TUM_CONFIG), [
        { id: 'c-latest', label: 'C' },
        { id: 'c-templates-latest', label: 'C' },
        { id: 'java-17-templates-latest', label: 'Java 17' },
        { id: 'java-17-latest', label: 'Java 17' },
        { id: 'python-latest', label: 'Python' }
    ]);
    // EduIDE-Landing-Page's public/config.js (development) writes appId.
    const devConfig = 'window.theiaCloudConfig = {\n  additionalApps: [\n    {\n      appId: "java-17-latest", \n      appName: "Java",\n    },\n  ],\n};';
    assert.deepEqual(EduIDE.parseLandingConfig(devConfig), [{ id: 'java-17-latest', label: 'Java' }]);
    assert.deepEqual(EduIDE.parseLandingConfig('<html>not a config</html>'), []);
});

test('appsFromLandingConfig prefers plain images over -templates', () => {
    assert.deepEqual(EduIDE.appsFromLandingConfig(EduIDE.parseLandingConfig(TUM_CONFIG)), {
        C: 'c-latest',
        'C++': 'c-latest',
        Java: 'java-17-latest',
        Kotlin: 'java-17-latest',
        Python: 'python-latest'
    });
    assert.deepEqual(EduIDE.appsFromLandingConfig([{ id: 'thm-java-25-latest', label: 'Java 25' }, { id: 'x', label: 'Unknown' }]), {
        Java: 'thm-java-25-latest',
        Kotlin: 'thm-java-25-latest'
    });
});

test('detected apps replace the built-in list for that address only', () => {
    const detected = { 'http://eduide.localhost/': { apps: { Java: 'java-17-latest' }, detectedAt: '2026-10-22T00:00:00Z' } };
    const custom = settings({ installation: 'custom', customUrl: 'http://eduide.localhost', detected });
    assert.equal(EduIDE.appDefFor(custom, 'Java'), 'java-17-latest');
    assert.equal(EduIDE.appDefFor(custom, 'Python'), undefined);
    assert.equal(EduIDE.resolveInstallation(custom).detectedAt, '2026-10-22T00:00:00Z');
    assert.equal(EduIDE.appDefFor(settings({ detected }), 'Python'), 'python-latest', 'TUM keeps its built-in list');
    assert.equal(EduIDE.appDefFor({ ...custom, overrides: { Python: 'p' } }, 'Python'), 'p', 'overrides still win');
});

test('normalizeUrl gives one key per landing page', () => {
    assert.equal(EduIDE.normalizeUrl('http://eduide.localhost'), 'http://eduide.localhost/');
    assert.equal(EduIDE.normalizeUrl('https://x.org/start//'), 'https://x.org/start/');
});

test('loadSettings fills in defaults', async () => {
    const storage = { get: async (defaults) => ({ ...defaults, installation: 'bonn', overrides: { Go: 'x' } }) };
    assert.deepEqual(await EduIDE.loadSettings(storage), { ...EduIDE.DEFAULT_SETTINGS, installation: 'bonn', overrides: { Go: 'x' } });
});

const provider = (over = {}) => ({ name: 'uni', type: 'gitlab', host: 'gitlab.example.org', displayName: 'Uni GitLab', ...over });

test('parseGitProviders reads the status contract', () => {
    const status = { gitProviders: [provider({ type: 'github', host: 'github.com', displayName: 'GitHub' }), provider()] };
    assert.deepEqual(EduIDE.parseGitProviders(status), [
        { host: 'github.com', type: 'github', displayName: 'GitHub' },
        { host: 'gitlab.example.org', type: 'gitlab', displayName: 'Uni GitLab' }
    ]);
    assert.equal(EduIDE.parseGitProviders({ gitProviders: [provider({ displayName: undefined })] })[0].displayName, 'gitlab.example.org');
});

test('parseGitProviders tolerates a missing field and wrong types', () => {
    for (const status of [undefined, null, 'x', 7, [], {}, { gitProviders: null }, { gitProviders: 'x' }, { gitProviders: {} }]) {
        assert.deepEqual(EduIDE.parseGitProviders(status), [], JSON.stringify(status));
    }
    const bad = [null, 'x', 3, [], provider({ host: 7 }), provider({ type: 'gitea' }), provider({ type: ['gitlab'] }), provider({ host: undefined })];
    assert.deepEqual(EduIDE.parseGitProviders({ gitProviders: bad }), []);
    assert.equal(EduIDE.parseGitProviders({ gitProviders: [provider({ displayName: 42 })] })[0].displayName, 'gitlab.example.org');
});

test('parseGitProviders accepts bare lowercase hostnames only', () => {
    for (const host of [
        'gitlab.example.org/evil', 'user:pw@gitlab.example.org', 'gitlab.example.org:8443', 'GitLab.Example.org', 'https://gitlab.example.org',
        'gitlab.example.org.', '', ' gitlab.example.org', 'git lab.example.org', '-a.org', 'a_b.org', '__proto__', 'git.example.org?x=1', 'a'.repeat(254)
    ]) {
        assert.deepEqual(EduIDE.parseGitProviders({ gitProviders: [provider({ host })] }), [], host);
    }
    assert.equal(EduIDE.parseGitProviders({ gitProviders: [provider({ host: 'localhost' })] }).length, 1);
    assert.equal(EduIDE.parseGitProviders({ gitProviders: [provider(), provider({ displayName: 'again' })] }).length, 1);
    assert.equal(EduIDE.parseGitProviders({ gitProviders: [provider({ displayName: 'x'.repeat(500) })] })[0].displayName.length, 64);
});

test('announced hosts merge with manual ones, which win', () => {
    const providers = EduIDE.parseGitProviders({ gitProviders: [provider(), provider({ host: 'ghe.example.org', type: 'github' })] });
    assert.deepEqual(EduIDE.mergeHosts({}, providers), { 'gitlab.example.org': 'gitlab', 'ghe.example.org': 'github' });
    assert.deepEqual(EduIDE.mergeHosts({ 'gitlab.example.org': 'gitea', 'x.org': 'gitlab' }, providers), {
        'gitlab.example.org': 'gitea',
        'ghe.example.org': 'github',
        'x.org': 'gitlab'
    });
    assert.deepEqual(EduIDE.mergeHosts({ 'x.org': 'gitlab' }, undefined), { 'x.org': 'gitlab' });
});

test('a provider host opens from the toolbar and builds a link by its type', () => {
    const hosts = EduIDE.mergeHosts({}, EduIDE.parseGitProviders({ gitProviders: [provider(), provider({ host: 'ghe.example.org', type: 'github' })] }));
    const gitlab = EduIDE.repoFromUrl('https://gitlab.example.org/g/s/r/-/tree/dev', hosts);
    assert.deepEqual(gitlab, { host: 'gitlab.example.org', nwo: 'g/s/r', ref: 'dev' });
    const url = EduIDE.buildLaunchUrl(settings(), gitlab);
    assert.equal(params(url).gitUri, 'https://gitlab.example.org/g/s/r.git');
    assert.equal(params(url).appDef, undefined);
    assert.equal(params(url).gitRef, undefined);
    const github = EduIDE.repoFromUrl('https://ghe.example.org/o/r/tree/main', hosts);
    assert.deepEqual(github, { host: 'ghe.example.org', nwo: 'o/r' });
    assert.equal(params(EduIDE.buildLaunchUrl(settings(), github)).gitUri, 'https://ghe.example.org/o/r.git');
    assert.equal(EduIDE.repoFromUrl('https://other.example.org/o/r', hosts), undefined);
});

test('statusUrl points at the origin of the installation', () => {
    assert.equal(EduIDE.statusUrl('https://ide.example.org/start/'), 'https://ide.example.org/api/v1/status');
    assert.equal(EduIDE.statusUrl('http://localhost:3100'), 'http://localhost:3100/api/v1/status');
    assert.equal(EduIDE.statusUrl(''), undefined);
    assert.equal(EduIDE.statusUrl('javascript:alert(1)'), undefined);
});

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, get: async (key) => ({ [key]: data[key] }), set: async (items) => Object.assign(data, items) };
}
const answer = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const URL_ = 'https://ide.example.org/';
const ORIGIN = 'https://ide.example.org';
const KEY = `gitProviders:${ORIGIN}`;

test('loadGitProviders fetches, caches and reuses the answer for 24 hours', async () => {
    const storage = fakeStorage();
    let calls = 0;
    const fetchFn = async (...args) => (calls++, answer({ gitProviders: [provider()] })(...args));
    const t0 = 1_000_000;
    const first = await EduIDE.loadGitProviders(URL_, storage, fetchFn, { now: t0 });
    assert.deepEqual(first, { providers: [{ host: 'gitlab.example.org', type: 'gitlab', displayName: 'Uni GitLab' }], fetchedAt: t0 });
    assert.equal(storage.data[KEY].fetchedAt, t0);
    await EduIDE.loadGitProviders(URL_, storage, fetchFn, { now: t0 + 24 * 3600 * 1000 - 1 });
    assert.equal(calls, 1);
    await EduIDE.loadGitProviders(URL_, storage, fetchFn, { now: t0 + 24 * 3600 * 1000 });
    assert.equal(calls, 2, 'expired');
    await EduIDE.loadGitProviders(URL_, storage, fetchFn, { now: t0 + 24 * 3600 * 1000 + 5, force: true });
    assert.equal(calls, 3, 'refresh forces a fetch');
    await EduIDE.loadGitProviders('https://other.example.org/', storage, fetchFn, { now: t0 });
    assert.equal(calls, 4, 'another installation has its own entry');
    assert.deepEqual(Object.keys(storage.data).sort(), ['gitProviders:https://ide.example.org', 'gitProviders:https://other.example.org']);
});

test('a missing field is cached as no providers', async () => {
    const storage = fakeStorage();
    const result = await EduIDE.loadGitProviders(URL_, storage, answer({ version: '2.7' }), { now: 5 });
    assert.deepEqual(result, { providers: [], fetchedAt: 5 });
    assert.deepEqual(storage.data[KEY], { providers: [], fetchedAt: 5 });
});

test('a failed fetch changes nothing and keeps the stale cache', async () => {
    const entry = { providers: [{ host: 'gitlab.example.org', type: 'gitlab', displayName: 'Uni GitLab' }], fetchedAt: 10 };
    const storage = fakeStorage({ [KEY]: entry });
    const later = 10 + 25 * 3600 * 1000;
    for (const fetchFn of [answer({}, 503), async () => { throw new TypeError('Failed to fetch'); }, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })]) {
        const result = await EduIDE.loadGitProviders(URL_, storage, fetchFn, { now: later });
        assert.deepEqual(result.providers, entry.providers);
        assert.equal(result.fetchedAt, 10);
        assert.ok(result.error);
        assert.deepEqual(storage.data[KEY], entry);
    }
    const empty = await EduIDE.loadGitProviders(URL_, fakeStorage(), answer({}, 500));
    assert.deepEqual(empty.providers, []);
    assert.ok(empty.error);
});

test('loadGitProviders survives a damaged cache and an unusable address', async () => {
    for (const damaged of [{ [KEY]: 'x' }, { [KEY]: { providers: 'x', fetchedAt: 'y' } }, { [KEY]: null }]) {
        const storage = fakeStorage(damaged);
        assert.equal((await EduIDE.loadGitProviders(URL_, storage, answer({ gitProviders: [provider()] }), { now: 1 })).providers.length, 1);
    }
    let called = false;
    assert.deepEqual(await EduIDE.loadGitProviders('', fakeStorage(), async () => (called = true)), { providers: [] });
    assert.equal(called, false);
});

test('overlapping loads for two installations keep both cache entries', async () => {
    const storage = fakeStorage();
    const slowStorage = { ...storage, get: async (key) => { const value = await storage.get(key); await new Promise((resolve) => setTimeout(resolve, 5)); return value; } };
    const ok = answer({ gitProviders: [provider()] });
    await Promise.all([
        EduIDE.loadGitProviders(URL_, slowStorage, ok, { now: 1 }),
        EduIDE.loadGitProviders('https://other.example.org/', slowStorage, ok, { now: 1 })
    ]);
    assert.deepEqual(Object.keys(storage.data).sort(), ['gitProviders:https://ide.example.org', 'gitProviders:https://other.example.org']);
});

test('the status request is bounded by a timeout signal and fails soft', async () => {
    let signal;
    const result = await EduIDE.loadGitProviders(URL_, fakeStorage(), async (url, init) => { signal = init.signal; throw new DOMException('timed out', 'TimeoutError'); }, { now: 1 });
    assert.ok(signal instanceof AbortSignal);
    assert.deepEqual(result.providers, []);
    assert.ok(result.error);
});
