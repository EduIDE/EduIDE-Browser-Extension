// The toolbar fallback: works on any repository page, including when GitHub's menu markup changed and the content
// script found nothing to inject into. It also switches the installation without a trip to the options page.
(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    // The loaded version, to compare with chrome://extensions after editing an unpacked copy.
    $('version').textContent = `v${chrome.runtime.getManifest().version}`;

    $('options').addEventListener('click', (event) => {
        event.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    function showMessage(text) {
        $('message').textContent = text;
        $('message').hidden = !text;
    }

    let settings = await EduIDE.loadSettings(chrome.storage.sync);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    for (const [id, installation] of Object.entries(EduIDE.INSTALLATIONS)) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = installation.url ? `${installation.label} · ${new URL(installation.url).host}` : installation.label;
        $('installation').append(option);
    }
    $('installation').addEventListener('change', async () => {
        await chrome.storage.sync.set({ installation: $('installation').value });
        settings = await EduIDE.loadSettings(chrome.storage.sync);
        render();
    });

    let facts;
    try {
        facts = await chrome.tabs.sendMessage(tab.id, { type: 'eduide:facts' });
    } catch {
        // No content script in this tab: not github.com, or the page was open before the extension was loaded.
        showMessage('Open a GitHub repository page. If you are on one, reload it first.');
        return;
    }
    if (!facts) {
        showMessage('This GitHub page is not a repository.');
        return;
    }

    let url;
    $('open').addEventListener('click', async () => {
        await chrome.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id });
        window.close();
    });

    function render() {
        const installation = EduIDE.resolveInstallation(settings);
        const appDef = EduIDE.appDefFor(settings, facts.language);
        $('installation').value = installation.id;
        if (installation.id === 'custom' && installation.url) {
            $('installation').selectedOptions[0].textContent = `Custom · ${installation.url}`;
        }
        $('repo').textContent = `${facts.nwo}${facts.isPublic === false ? ' (private)' : ''}`;
        $('language').textContent = facts.language ?? 'unknown (open the repository root once)';
        $('app').textContent = appDef ?? 'chosen on the landing page';
        $('ref').textContent = facts.ref
            ? settings.sendRef
                ? `${facts.ref} (sent as gitRef)`
                : `${facts.ref}; the default branch is cloned`
            : 'default branch';
        $('facts').hidden = false;
        $('note').textContent = installation.note ?? '';
        $('note').hidden = !installation.note;

        url = undefined;
        $('open').disabled = true;
        $('url-details').hidden = true;
        try {
            url = EduIDE.buildLaunchUrl(settings, facts);
        } catch (error) {
            showMessage(error.message);
            return;
        }
        showMessage(
            facts.isPublic === false ? 'Private repository: EduIDE will ask you to sign in to GitHub to clone it.' : ''
        );
        $('url').textContent = url;
        $('url-details').hidden = false;
        $('open').disabled = false;
    }

    render();
})();
