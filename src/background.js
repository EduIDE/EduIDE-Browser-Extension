// Opens the launch URL for clicks in GitHub's Code menu. Building it here keeps the settings in one place, and a tab
// the extension opens is never caught by a popup blocker.
importScripts('lib/eduide.js');

// Which EduIDE to open is the first decision, so it is asked for right away instead of silently defaulting to TUM.
chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.runtime.openOptionsPage();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'eduide:open') {
        return false;
    }
    openInEduIDE(message.facts, sender.tab)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
    return true; // the response is sent asynchronously
});

async function openInEduIDE(facts, tab) {
    const settings = await EduIDE.loadSettings(chrome.storage.sync);
    const url = EduIDE.buildLaunchUrl(settings, facts);
    await chrome.tabs.create({ url, ...(tab ? { index: tab.index + 1, openerTabId: tab.id } : {}) });
    return { url };
}
