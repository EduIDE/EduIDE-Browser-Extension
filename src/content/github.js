// Injects "Open in EduIDE" into GitHub's <> Code menu and answers the popup's questions about the current repository.
//
// GitHub renders the menu as a Primer React ActionList inside an AnchoredOverlay portal that exists only while the
// menu is open, and navigates without page loads. A MutationObserver therefore watches for the list itself, which
// covers every page and every client-side navigation without hooking GitHub's router.
//
// Selectors use data-component, aria-label and visible text only. The prc-* class names are hashed per Primer release.
(function () {
    'use strict';

    const { repoFromPath, parseArchiveRef, parseLanguageLabel } = globalThis.EduIDE;

    const MARK = 'data-eduide';
    const MENU_LIST = '[data-component="AnchoredOverlay"] ul[aria-label="Repository actions"]';
    const MENU_ITEM = ':scope > li[data-component="ActionList.Item"]';
    const LABEL = 'Open in EduIDE';
    const PRIVATE_HINT = 'Private repositories are not supported yet';
    // Mortarboard in the EduIDE logo's orange, sized like the octicons next to it.
    const ICON =
        '<svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">' +
        '<path fill="#F78205" d="M8 2.2 15.6 5 8 7.9.4 5Z"/>' +
        '<path fill="#F78205" d="M3.6 7v3.3c0 1.3 2 2.4 4.4 2.4s4.4-1.1 4.4-2.4V7L8 8.7Z"/></svg>';

    function meta(name) {
        return document.querySelector(`meta[name="${name}"]`)?.content || undefined;
    }

    function currentNwo() {
        return meta('octolytics-dimension-repository_nwo') ?? repoFromPath(location.pathname);
    }

    // The language bar is only on pages with the About sidebar, so the last value seen is kept for this tab.
    function readLanguage(nwo) {
        const key = `eduide:language:${nwo}`;
        for (const link of document.querySelectorAll(`a[href^="/${nwo}/search?l="]`)) {
            const language = parseLanguageLabel(link.textContent);
            if (language) {
                try {
                    sessionStorage.setItem(key, language);
                } catch {
                    // storage blocked; the value is still returned
                }
                return language;
            }
        }
        try {
            return sessionStorage.getItem(key) ?? undefined;
        } catch {
            return undefined;
        }
    }

    function readRef(menuList) {
        const archive = (menuList ?? document).querySelector('a[href*="/archive/"][href$=".zip"]');
        const fromArchive = parseArchiveRef(archive?.getAttribute('href'));
        if (fromArchive) {
            return fromArchive;
        }
        // Without the open menu, /tree/<ref> is the best guess; branch names containing "/" come out truncated.
        const match = /^\/[^/]+\/[^/]+\/(?:tree|blob)\/([^/]+)/.exec(location.pathname);
        return match ? decodeURIComponent(match[1]) : undefined;
    }

    function repoFacts(menuList) {
        const nwo = currentNwo();
        if (!nwo) {
            return undefined;
        }
        const visibility = meta('octolytics-dimension-repository_public');
        return {
            nwo,
            isPublic: visibility === 'true' ? true : visibility === 'false' ? false : undefined,
            language: readLanguage(nwo),
            ref: readRef(menuList)
        };
    }

    function closeMenu(list) {
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    function open(list) {
        const facts = repoFacts(list);
        try {
            chrome.runtime.sendMessage({ type: 'eduide:open', facts }, (response) => {
                if (chrome.runtime.lastError || response?.error) {
                    alert(`Open in EduIDE: ${response?.error ?? chrome.runtime.lastError.message}`);
                }
            });
        } catch {
            // The extension was reloaded or updated while this page stayed open.
            alert('Open in EduIDE was updated. Reload this page to use it.');
        }
    }

    // Copies an existing item so the new one inherits GitHub's styling, theme and density, then swaps its content.
    function buildItem(template, list, facts) {
        const item = template.cloneNode(true);
        item.setAttribute(MARK, '');

        let control = item.querySelector('button, a');
        if (control.tagName === 'A') {
            const button = document.createElement('button');
            button.type = 'button';
            for (const { name, value } of control.attributes) {
                if (!['href', 'rel', 'target', 'data-turbo'].includes(name)) {
                    button.setAttribute(name, value);
                }
            }
            button.classList.remove(...[...button.classList].filter((name) => name.includes('Link')));
            button.append(...control.childNodes);
            control.replaceWith(button);
            control = button;
        }

        const label =
            item.querySelector('[id$="--label"]') ??
            [...item.querySelectorAll('span')].reverse().find((span) => !span.children.length && span.textContent.trim());
        label.textContent = LABEL;
        item.querySelectorAll('[data-component="ActionList.TrailingVisual"], [id$="--description"]').forEach((node) => node.remove());
        const leading = item.querySelector('[data-component="ActionList.LeadingVisual"]');
        if (leading) {
            (leading.querySelector('span') ?? leading).innerHTML = ICON;
        }
        // React ids would collide with the original's.
        item.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        control.removeAttribute('aria-labelledby');
        control.removeAttribute('aria-describedby');

        const disabled = facts?.isPublic === false;
        control.setAttribute('aria-label', disabled ? `${LABEL} (${PRIVATE_HINT.toLowerCase()})` : LABEL);
        control.title = disabled ? PRIVATE_HINT : 'Open this repository in an EduIDE session';
        if (disabled) {
            control.setAttribute('aria-disabled', 'true');
            control.style.opacity = '0.5';
            control.style.cursor = 'not-allowed';
        }

        control.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (disabled) {
                return;
            }
            open(list);
            closeMenu(list);
        });
        return item;
    }

    function inject(list) {
        if (list.querySelector(`[${MARK}]`)) {
            return;
        }
        const items = [...list.querySelectorAll(MENU_ITEM)];
        if (!items.length) {
            return;
        }
        // Directly below "Open in GitHub Copilot app", i.e. before "Open with GitHub Desktop".
        const anchor =
            items.find((item) => /GitHub Desktop/i.test(item.textContent)) ??
            items.find((item) => /Download ZIP/i.test(item.textContent));
        const template = items.find((item) => /GitHub Desktop/i.test(item.textContent)) ?? anchor ?? items.at(-1);
        list.insertBefore(buildItem(template, list, repoFacts(list)), anchor ?? null);
    }

    let scheduled = false;
    function scan() {
        scheduled = false;
        document.querySelectorAll(MENU_LIST).forEach(inject);
        const nwo = currentNwo();
        if (nwo) {
            readLanguage(nwo);
        }
    }
    new MutationObserver(() => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(scan);
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
    scan();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'eduide:facts') {
            sendResponse(repoFacts() ?? null);
        }
    });
})();
