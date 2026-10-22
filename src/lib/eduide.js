// Shared, DOM-free logic: installations, settings, and the launch URL.
//
// Loaded as a classic script everywhere (content script, service worker via importScripts, popup, options), so it
// publishes itself on globalThis. Node's test runner loads it through module.exports.
(function (root) {
    'use strict';

    // App ids are a contract with each installation's chart values (`appDefinitions.apps.<id>`). The landing page
    // rejects an `appDef` it does not offer with "Invalid default selection value", so a language is mapped only to an
    // app that installation actually has. Checked against each installation's live /config.js on 22 Oct 2026.
    const TUM_APPS = {
        Java: 'java-17-latest',
        Kotlin: 'java-17-latest',
        C: 'c-latest',
        'C++': 'c-latest',
        JavaScript: 'javascript-latest',
        TypeScript: 'javascript-latest',
        Python: 'python-latest',
        Rust: 'rust-latest',
        OCaml: 'ocaml-latest'
    };

    const INSTALLATIONS = {
        tum: {
            label: 'TUM',
            url: 'https://eduide.artemis.cit.tum.de/',
            apps: TUM_APPS,
            note: 'Sessions are ephemeral: changes are lost when the session ends unless you push them.'
        },
        staging: {
            label: 'TUM staging',
            url: 'https://staging.eduide.student.k8s.aet.cit.tum.de/',
            apps: TUM_APPS,
            note: 'Sessions are ephemeral.'
        },
        bonn: {
            label: 'Bonn',
            url: 'https://bonn.eduide.aet.cit.tum.de/',
            apps: { JavaScript: 'javascript-latest', TypeScript: 'javascript-latest' },
            note: 'Offers JavaScript only.'
        },
        mannheim: {
            label: 'Mannheim',
            url: 'https://mannheim.eduide.aet.cit.tum.de/',
            apps: {},
            note: 'Its Java 25 image ships without Scorpio, so the repository is not cloned automatically.'
        },
        cluster: {
            label: 'Local cluster',
            url: 'https://eduide.localhost/',
            apps: { Java: 'java-17-latest', Kotlin: 'java-17-latest' },
            note: 'The kind cluster from local-eduide-cloud (./up.sh). Ephemeral sessions, like TUM, without a login.'
        },
        local: {
            label: 'Local portal',
            url: 'http://localhost:3100/',
            apps: { Java: 'java-17-latest', Kotlin: 'java-17-latest' },
            note: 'Needs local-eduide-portal (node server.mjs) and Docker. Unknown languages fall back to Java 17.'
        },
        custom: {
            label: 'Custom',
            url: '',
            apps: {},
            note: 'Use Detect images or overrides to preselect languages.'
        }
    };

    const DEFAULT_SETTINGS = {
        installation: 'tum',
        customUrl: '',
        // language -> appDef; an empty string removes a default mapping, so the landing page asks instead.
        overrides: {},
        // landing page URL -> { apps, detectedAt }, read from that installation's /config.js. Replaces the built-in
        // mapping for that address.
        detected: {},
        // Today's landing page ignores gitRef; it is sent only for testing the proposed GIT_REF support.
        sendRef: false
    };

    // An app's label on the landing page (its chart `landingPage.label`) -> the GitHub languages it serves.
    const LANGUAGES_BY_LABEL = [
        [/^java\b/i, ['Java', 'Kotlin']],
        [/^c$/i, ['C', 'C++']],
        [/^javascript\b/i, ['JavaScript', 'TypeScript']],
        [/^python\b/i, ['Python']],
        [/^rust\b/i, ['Rust']],
        [/^ocaml\b/i, ['OCaml']],
        [/^haskell\b/i, ['Haskell']],
        [/^swift\b/i, ['Swift']]
    ];

    // First path segments that are GitHub pages, not repository owners.
    const RESERVED_OWNERS = new Set([
        'about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'customer-stories', 'dashboard',
        'enterprise', 'explore', 'features', 'issues', 'join', 'login', 'logout', 'marketplace', 'new',
        'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'sessions',
        'settings', 'site', 'sponsors', 'stars', 'topics', 'trending', 'users', 'watching'
    ]);

    const NWO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

    function isValidNwo(nwo) {
        return typeof nwo === 'string' && NWO_PATTERN.test(nwo) && !nwo.endsWith('/.') && !nwo.endsWith('/..');
    }

    function repoFromPath(pathname) {
        const [owner, repo] = String(pathname).split('/').filter(Boolean);
        if (!owner || !repo || RESERVED_OWNERS.has(owner.toLowerCase())) {
            return undefined;
        }
        const nwo = `${owner}/${repo.replace(/\.git$/, '')}`;
        return isValidNwo(nwo) ? nwo : undefined;
    }

    // The Code menu's "Download ZIP" link follows the branch picker:
    // /o/r/archive/refs/heads/<branch>.zip, /o/r/archive/refs/tags/<tag>.zip, or /o/r/archive/<sha>.zip.
    function parseArchiveRef(href) {
        const match = /\/archive\/(?:refs\/(?:heads|tags)\/)?(.+)\.zip$/.exec(String(href ?? ''));
        return match ? decodeURIComponent(match[1]) : undefined;
    }

    // Language bar entries read like "Kotlin 99.8%"; "Other" is GitHub's remainder bucket, not a language.
    function parseLanguageLabel(text) {
        const name = String(text ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\s*[\d.]+\s*%\s*$/, '')
            .trim();
        return name && name !== 'Other' ? name : undefined;
    }

    // The landing page's /config.js is JavaScript (window.theiaCloudConfig = {...}), which an extension cannot
    // evaluate, but the chart renders additionalApps in a fixed shape. The dev config writes appId instead of
    // serviceAuthToken; both are accepted.
    function parseLandingConfig(text) {
        // The list closes at its own indentation; nested lists such as buildSystems close deeper.
        const block = /^([ \t]*)additionalApps\s*:\s*\[([\s\S]*?)^\1\]/m.exec(String(text ?? ''));
        if (!block) {
            return [];
        }
        const apps = [];
        const entry = /(?:serviceAuthToken|appId)\s*:\s*["']([^"']+)["']\s*,\s*appName\s*:\s*["']([^"']*)["']/g;
        for (const match of block[2].matchAll(entry)) {
            apps.push({ id: match[1], label: match[2] });
        }
        return apps;
    }

    // Plain images come before -templates ones: a template is pointless next to a cloned repository.
    function appsFromLandingConfig(apps) {
        const mapping = {};
        const ordered = [...apps].sort((a, b) => Number(/-templates/.test(a.id)) - Number(/-templates/.test(b.id)));
        for (const { id, label } of ordered) {
            const languages = LANGUAGES_BY_LABEL.find(([pattern]) => pattern.test(label.trim()))?.[1] ?? [];
            for (const language of languages) {
                mapping[language] ??= id;
            }
        }
        return mapping;
    }

    function normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}/`;
        } catch {
            return String(url ?? '');
        }
    }

    function resolveInstallation(settings) {
        const id = settings.installation || DEFAULT_SETTINGS.installation;
        const installation = INSTALLATIONS[id];
        if (!installation) {
            // Saved by a newer copy of this code than the one running here. For an unpacked extension that happens
            // when the files changed on disk: pages read them afresh, the service worker keeps the old ones. Falling
            // back to the default would silently open the wrong EduIDE.
            return { id, unknown: true, label: id, url: '', apps: {} };
        }
        const url = id === 'custom' ? String(settings.customUrl ?? '').trim() : installation.url;
        const detected = url ? settings.detected?.[normalizeUrl(url)] : undefined;
        return detected
            ? { id, ...installation, url, apps: detected.apps, detectedAt: detected.detectedAt }
            : { id, ...installation, url };
    }

    function effectiveApps(settings) {
        const apps = { ...resolveInstallation(settings).apps };
        for (const [language, appDef] of Object.entries(settings.overrides ?? {})) {
            if (appDef) {
                apps[language] = appDef;
            } else {
                delete apps[language];
            }
        }
        return apps;
    }

    function appDefFor(settings, language) {
        return language ? effectiveApps(settings)[language] : undefined;
    }

    function buildLaunchUrl(settings, facts) {
        const installation = resolveInstallation(settings);
        if (installation.unknown) {
            throw new Error(
                `This version of the extension does not know the EduIDE "${installation.id}". ` +
                    'Reload the extension on chrome://extensions, then reload this page.'
            );
        }
        if (!installation.url) {
            throw new Error('No EduIDE address is configured. Set one in the extension options.');
        }
        let url;
        try {
            url = new URL(installation.url);
        } catch {
            throw new Error(`"${installation.url}" is not a valid EduIDE address.`);
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('The EduIDE address must start with https:// or http://.');
        }
        if (!isValidNwo(facts?.nwo)) {
            throw new Error('This page is not a GitHub repository.');
        }
        const appDef = appDefFor(settings, facts.language);
        if (appDef) {
            url.searchParams.set('appDef', appDef);
        }
        // Always HTTPS: Scorpio passes GIT_URI to new URL(), which rejects the scp-style SSH form.
        url.searchParams.set('gitUri', `https://github.com/${facts.nwo}.git`);
        url.searchParams.set('source', 'github');
        if (settings.sendRef && facts.ref) {
            url.searchParams.set('gitRef', facts.ref);
        }
        return url.toString();
    }

    async function loadSettings(storageArea) {
        const stored = await storageArea.get(DEFAULT_SETTINGS);
        return {
            ...DEFAULT_SETTINGS,
            ...stored,
            overrides: { ...(stored.overrides ?? {}) },
            detected: { ...(stored.detected ?? {}) }
        };
    }

    const api = {
        INSTALLATIONS,
        DEFAULT_SETTINGS,
        isValidNwo,
        repoFromPath,
        parseArchiveRef,
        parseLanguageLabel,
        parseLandingConfig,
        appsFromLandingConfig,
        normalizeUrl,
        resolveInstallation,
        effectiveApps,
        appDefFor,
        buildLaunchUrl,
        loadSettings
    };

    root.EduIDE = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(globalThis);
