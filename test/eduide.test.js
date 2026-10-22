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
        gitUri: 'https://github.com/octocat/Hello-World.git',
        source: 'github'
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
        assert.throws(() => EduIDE.buildLaunchUrl(settings(), { nwo }), /not a GitHub repository/, String(nwo));
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
