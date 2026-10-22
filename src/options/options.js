(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const settings = await EduIDE.loadSettings(chrome.storage.sync);

    for (const [id, installation] of Object.entries(EduIDE.INSTALLATIONS)) {
        const label = document.createElement('label');
        label.className = 'installation';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'installation';
        radio.value = id;
        radio.checked = settings.installation === id;
        const text = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = installation.label;
        const host = document.createElement('span');
        host.className = 'host';
        host.textContent = installation.url ? new URL(installation.url).host : 'your own address';
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = installation.note;
        text.append(name, ' ', host, note);
        label.append(radio, text);
        $('installations').append(label);
    }

    $('custom-url').value = settings.customUrl;
    $('overrides').value = Object.keys(settings.overrides).length ? JSON.stringify(settings.overrides, undefined, 2) : '';
    $('send-ref').checked = settings.sendRef;

    function readForm() {
        const overridesText = $('overrides').value.trim();
        let overrides = {};
        if (overridesText) {
            overrides = JSON.parse(overridesText);
            const valid =
                overrides && typeof overrides === 'object' && !Array.isArray(overrides) && Object.values(overrides).every((value) => typeof value === 'string');
            if (!valid) {
                throw new Error('Overrides must be a JSON object of language → app id strings.');
            }
        }
        return {
            installation: document.querySelector('input[name="installation"]:checked')?.value ?? EduIDE.DEFAULT_SETTINGS.installation,
            customUrl: $('custom-url').value.trim(),
            overrides,
            detected: settings.detected,
            sendRef: $('send-ref').checked
        };
    }

    function currentInstallation() {
        try {
            return EduIDE.resolveInstallation(readForm());
        } catch {
            // overrides JSON is mid-edit; the installation part of the form is still what counts
            return EduIDE.resolveInstallation(settings);
        }
    }

    function renderDetection() {
        const installation = currentInstallation();
        $('detect').disabled = !installation.url;
        $('forget').hidden = !installation.detectedAt;
        $('detect-status').textContent = installation.detectedAt
            ? `Using the images detected on ${new Date(installation.detectedAt).toLocaleString()}.`
            : installation.url
              ? 'Using the built-in list.'
              : '';
    }

    $('detect').addEventListener('click', async () => {
        const installation = currentInstallation();
        if (!installation.url) {
            return;
        }
        const base = EduIDE.normalizeUrl(installation.url);
        $('detect-status').textContent = 'Reading config.js…';
        try {
            // Must run directly in the click handler: Chrome only shows the permission prompt for a user gesture.
            const granted = await chrome.permissions.request({ origins: [`${new URL(base).origin}/*`] });
            if (!granted) {
                $('detect-status').textContent = 'Permission declined; keeping the current list.';
                return;
            }
            const response = await fetch(new URL('config.js', base), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`config.js answered ${response.status}`);
            }
            const apps = EduIDE.parseLandingConfig(await response.text());
            if (!apps.length) {
                throw new Error('config.js lists no apps');
            }
            settings.detected = {
                ...settings.detected,
                [base]: { apps: EduIDE.appsFromLandingConfig(apps), detectedAt: new Date().toISOString() }
            };
            await chrome.storage.sync.set({ detected: settings.detected });
            render();
            $('detect-status').textContent = `Found ${apps.map((app) => app.id).join(', ')}.`;
            $('forget').hidden = false;
        } catch (error) {
            $('detect-status').textContent = `Could not read the images: ${error.message}.`;
        }
    });

    $('forget').addEventListener('click', async () => {
        const { [EduIDE.normalizeUrl(currentInstallation().url)]: _removed, ...rest } = settings.detected;
        settings.detected = rest;
        await chrome.storage.sync.set({ detected: settings.detected });
        render();
    });

    function render() {
        let current;
        try {
            current = readForm();
            $('overrides-error').hidden = true;
        } catch (error) {
            $('overrides-error').textContent = error.message;
            $('overrides-error').hidden = false;
            return undefined;
        }
        $('custom-url-row').hidden = current.installation !== 'custom';
        const rows = Object.entries(EduIDE.effectiveApps(current)).map(([language, appDef]) => {
            const row = document.createElement('tr');
            for (const value of [language, appDef]) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
            }
            return row;
        });
        if (!rows.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 2;
            cell.className = 'note';
            cell.textContent = 'No language is preselected; the landing page always asks.';
            row.append(cell);
            rows.push(row);
        }
        $('mapping').replaceChildren(...rows);
        renderDetection();
        return current;
    }

    $('form').addEventListener('input', () => {
        $('status').textContent = '';
        render();
    });
    // Choosing a preset takes effect at once, as in the popup; leaving it unsaved is how a click still opened TUM.
    // Custom waits for Save, because its address has to be checked first.
    $('installations').addEventListener('change', async (event) => {
        const installation = event.target.value;
        if (event.target.name !== 'installation' || installation === 'custom') {
            if (installation === 'custom') {
                $('status').textContent = 'Enter the address, then Save.';
            }
            return;
        }
        await chrome.storage.sync.set({ installation });
        settings.installation = installation;
        $('status').textContent = `Saved: ${EduIDE.INSTALLATIONS[installation].label}.`;
    });
    $('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const current = render();
        if (!current) {
            return;
        }
        if (current.installation === 'custom') {
            try {
                EduIDE.buildLaunchUrl(current, { nwo: 'octocat/Hello-World' });
            } catch (error) {
                $('status').textContent = error.message;
                return;
            }
        }
        await chrome.storage.sync.set(current);
        $('status').textContent = 'Saved.';
    });

    render();
})();
