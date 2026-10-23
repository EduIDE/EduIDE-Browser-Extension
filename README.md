# Open in EduIDE: Chrome extension prototype

Adds **Open in EduIDE** to GitHub's **<> Code** menu, directly below "Open in GitHub Copilot app". A click opens the
EduIDE landing page with the repository and a matching language image preselected. After login, Scorpio clones the
repository into `/home/project`.

A prototype. It builds a link to the landing page's existing `appDef` and `gitUri` parameters, so it needs no change to
any other EduIDE repository. Private repositories open the same way: the link never carries credentials, and Scorpio
asks the student to sign in to GitHub inside the session before it clones (needs the Scorpio GitHub module, see
[Private repositories](#private-repositories)).

Plain JavaScript, Manifest V3, no build step and no dependencies. Chrome and Edge 116+.

## Install

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this folder (`eduide-github-extension`, the one with `manifest.json`).
4. Pin the extension (puzzle icon → pin "Open in EduIDE"), so the toolbar fallback is one click away.
5. **Reload any GitHub tab that was already open.** Content scripts only enter pages loaded after the install.

After editing the code: click the reload icon on the extension's card, then reload the GitHub tab.

## Choosing the EduIDE

The settings page opens by itself after a fresh install, so the first decision is which EduIDE to open. Later:
right-click the toolbar icon → **Options**, or the **Settings** link in the popup. The popup also has an **EduIDE**
drop-down for switching quickly.

| Option | Address | Images preselected |
|---|---|---|
| TUM (default) | `eduide.artemis.cit.tum.de` | Java, Kotlin, C, C++, JavaScript, TypeScript, Python, Rust, OCaml |
| TUM staging | `staging.eduide.student.k8s.aet.cit.tum.de` | as TUM |
| Bonn | `bonn.eduide.aet.cit.tum.de` | JavaScript, TypeScript |
| Mannheim | `mannheim.eduide.aet.cit.tum.de` | none (its Java 25 image has no Scorpio, so nothing would be cloned) |
| Local cluster | `eduide.localhost` | Java, Kotlin. A local kind deployment of EduIDE Cloud (see [Local deployments](#local-deployments)) |
| Local portal | `localhost:3100` | Java, Kotlin. A Docker stand-in for the landing page (see [Local deployments](#local-deployments)) |
| Custom | any address you enter | only your overrides, until you detect them |

**Detect images** reads the selected installation's `/config.js` and builds the language → image list from the apps it
really offers. Chrome asks once for permission to read that site, which is why the extension has
`optional_host_permissions` and no host access by default. The detected list replaces the built-in one for that
address; **Use the built-in list** undoes it. Overrides apply on top of either.

## Test plan

Suggested public repositories, all small enough to clone quickly:

| Repository | GitHub language | Preselected image (TUM) |
|---|---|---|
| `spring-guides/gs-rest-service` | Java | `java-17-latest` |
| `pallets/itsdangerous` | Python | `python-latest` |
| `rust-lang/rustlings` | Rust | `rust-latest` |
| `sindresorhus/slugify` | JavaScript | `javascript-latest` |
| `octocat/Hello-World` | none | none, the landing page asks |

### 1. The menu item

Open `https://github.com/spring-guides/gs-rest-service` → **<> Code**.

- [ ] "Open in EduIDE" (orange mortarboard) sits between "Open in GitHub Copilot app" and "Open with GitHub Desktop".
- [ ] It matches the other items in light and dark theme (GitHub settings → Appearance).
- [ ] Closing and reopening the menu shows exactly one item.
- [ ] Go to **Issues**, back to **Code**, open the menu again: still exactly one item. (GitHub navigates without page
  loads; this checks the observer.)
- [ ] Keyboard: focus "Open in GitHub Copilot app", press **Tab**, and focus is on "Open in EduIDE". **Enter** opens it.

### 2. Launch on TUM

Click **Open in EduIDE**.

- [ ] A new tab opens right next to the GitHub tab, at
  `https://eduide.artemis.cit.tum.de/?appDef=java-17-latest&gitUri=https%3A%2F%2Fgithub.com%2Fspring-guides%2Fgs-rest-service.git&source=github`.
- [ ] The menu closes.
- [ ] **Before each repository on TUM:** make sure no earlier test session with the same image is still running (see
  Troubleshooting, "repository from an earlier test").
- [ ] Log in with Keycloak. You return to the landing page with the URL parameters still in place.
- [ ] **Expected today:** the landing page shows the language picker instead of starting at once. It starts
  automatically only for Artemis links, which carry an `artemisToken`. Pick **Java 17**. (A proposed landing-page
  change replaces this with a one-click confirmation.)
- [ ] The IDE opens. Within a few seconds the Explorer shows the repository at the workspace root, and
  `git remote -v` in the terminal shows `https://github.com/spring-guides/gs-rest-service.git`.
- [ ] Note that TUM sessions are ephemeral: unpushed changes are gone after the session ends.

Repeat with one or two of the other repositories. `octocat/Hello-World` has no language, so its link carries no
`appDef`.

### 3. Private repositories

Open a private repository you have access to → **<> Code**.

- [ ] The item is enabled and shows a padlock after its label. Its tooltip says "Private repository: EduIDE will ask
  you to sign in to GitHub to clone it".
- [ ] The popup shows the repository as "(private)", the same hint, and an enabled button.
- [ ] The generated link is the same as for a public repository: no token, no username.

### 4. Toolbar popup

On any page of a repository, click the toolbar icon.

- [ ] It lists repository, language, image, branch and installation, and opens the same URL as the menu item.
- [ ] Switching the **EduIDE** drop-down updates image and launch URL at once, and the Code menu item uses the new
  choice on its next click.
- [ ] **Launch URL** shows the exact link.
- [ ] On a non-GitHub page it asks you to open a repository. On a GitHub tab opened before the install, it asks you to
  reload.
- [ ] On a subfolder page (`/tree/main/complete`) the language is still known if you visited the repository root in
  this tab first. Without that it says "unknown", and the landing page asks for the language.

### 5. Branches

Switch the branch picker to a non-default branch and open the Code menu, then the popup.

- [ ] The popup shows that branch and says the default branch is cloned. That is today's behaviour: Scorpio has no
  branch support.
- [ ] With **Options → Experimental → Send the selected branch as gitRef** enabled, the launch URL also carries
  `gitRef=<branch>`. The landing page ignores it until it and Scorpio support a branch.

### 6. Settings

- [ ] **Bonn** preselects only JavaScript/TypeScript. A Java repository's link carries no `appDef`, so Bonn does not
  show "Invalid default selection value".
- [ ] Overrides: `{ "Kotlin": "", "Go": "java-17-latest" }` updates the table below the text box. Invalid JSON shows an
  error and is not saved.
- [ ] **Custom** refuses to save without an http(s) address.
- [ ] **Detect images** on TUM asks for permission to read `eduide.artemis.cit.tum.de`, then lists its apps and shows
  "Using the images detected on …". **Use the built-in list** returns to the built-in mapping.
- [ ] After removing and re-adding the extension, the settings page opens by itself.

### 7. A local EduIDE

See [Local deployments](#local-deployments). With **Local cluster** selected, open
[`spethso/EduIDE-GitHub-Extension-Test`](https://github.com/spethso/EduIDE-GitHub-Extension-Test) →
**Open in EduIDE** → pick **Java 17** on the landing page. The IDE opens with the repository cloned.

## Local deployments

The **Local cluster** and **Local portal** options target two setups for testing without a shared installation. Their
scripts are not part of this repository yet.

- **Local cluster** (`https://eduide.localhost/`): a one-node kind cluster running the real operator, REST service and
  landing page from [EduIDE-Helm](https://github.com/EduIDE/EduIDE-Helm), with ephemeral sessions like TUM and no
  login. TLS comes from [mkcert](https://github.com/FiloSottile/mkcert), so run `mkcert -install` once and restart
  Chrome.
- **Local portal** (`http://localhost:3100/`): a small Node server that starts `ghcr.io/eduide/eduide/java-17:latest`
  in Docker with the same environment the landing page would give a session. Every language opens in Java 17.

Until [EduIDE/EduIDE-Cloud#147](https://github.com/EduIDE/EduIDE-Cloud/pull/147) is deployed, an ephemeral installation
reopens your first repository's session when you open a second one with the same image.

## Already verified (22 Oct 2026)

- `npm test`: 16 unit tests for parsing, app selection, `/config.js` detection and the launch URL. Detection was
  also run against the live `config.js` of TUM, Bonn, Mannheim and the local cluster.
- On the local EduIDE Cloud: the extension's link for `spethso/EduIDE-GitHub-Extension-Test` opened the landing page,
  picking Java 17 started a session, and that session had the repository cloned in `/home/project`.
- The content script, run against live github.com (`ccims/gropius-backend`) with a stand-in for the extension API:
  the item is inserted at the right position, the click sends `{ nwo, isPublic, language: "Kotlin", ref: "main" }`
  and closes the menu, reopening and in-page navigation produce exactly one item, and Tab reaches it.
- The generated TUM link: the landing page accepts `appDef=java-17-latest` and shows the login, with no error.
- The full chain through the local portal: a link for `octocat/Hello-World` started an EduIDE container, and Scorpio
  cloned the repository into `/home/project` (`origin https://github.com/octocat/Hello-World.git`) with no Artemis token.
- The popup and options pages, rendered with stubbed extension APIs.

**Not verified:** loading the packed extension in Chrome itself (the built-in test browser cannot load extensions), a
logged-in launch on TUM, and the private clone against real GitHub (it was tested against a stand-in GitHub server on
the local cluster, see [EduIDE/scorpio](https://github.com/EduIDE/scorpio)).

## Unit tests

```bash
npm test
```

Node 18+, no install step.

## Layout

```
manifest.json
icons/                   from EduIDE/EduIDE logo/edu-ide-hat.png
src/lib/eduide.js        installations, app ids, settings, launch URL; shared by every part, tested in Node
src/content/github.js    finds the Code menu, injects the item, reads repository details from the page
src/background.js        opens the launch tab for menu clicks
src/popup/               toolbar fallback
src/options/             installation, language overrides, experimental gitRef
test/eduide.test.js      node:test
```

## How it finds things on GitHub

All details come from the page. The extension makes no GitHub API calls and no requests to EduIDE: it only opens a
tab. Its only permission is `storage`, plus content-script access to `github.com`.

| What | Where on the page |
|---|---|
| Code menu | `[data-component="AnchoredOverlay"] ul[aria-label="Repository actions"]`, watched by a `MutationObserver` |
| Item styling | cloned from "Open with GitHub Desktop", ids stripped |
| `owner/repo` | `meta[name="octolytics-dimension-repository_nwo"]`, else the URL path |
| Public or private | `meta[name="octolytics-dimension-repository_public"]` |
| Branch | the menu's "Download ZIP" link (`/archive/refs/heads/<branch>.zip`) |
| Language | first entry of the language bar (`a[href^="/<owner>/<repo>/search?l="]`), cached per tab |

The selectors avoid GitHub's hashed `prc-*` class names. If GitHub changes the menu, the item disappears and the
toolbar popup keeps working.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No item in the Code menu | The tab was open before the extension was installed or reloaded. Reload the tab. If it is still missing, GitHub changed its markup; use the popup |
| Alert "was updated. Reload this page" | The extension was reloaded while the tab stayed open |
| Opens the wrong EduIDE, or "does not know the EduIDE …" | The files changed on disk but the extension was not reloaded. Chrome reads the popup and settings pages afresh, so they offer the new choice, while the background worker that opens the tab still runs the old code. Click reload on the extension's card in `chrome://extensions`, then reload the GitHub tab. The popup footer shows the loaded version |
| Landing page: "Invalid default selection value" | The `appDef` does not exist on that installation. Fix the override, or choose the right installation |
| IDE opens with the repository from an earlier test | On TUM (ephemeral storage) EduIDE-Cloud names a session after **user + app** only (`K8sUtil.launchEphemeralSession` → `getSessionName(user, appDefinition, false)`) and returns an existing session as it is (`DefaultSessionResourceClient.launch`: `get(name).orElseGet(create)`). A second repository in the same image therefore lands in the first one's session, and the new `GIT_URI` is never applied. Close the old IDE tab and wait until it stops (30 min of inactivity), pick a different image, or test with **Local portal** (one container per repository) |
| IDE opens with an empty workspace | The image has no Scorpio (Mannheim's `thm-java-25`), or the clone failed. Scorpio shows no notification when a clone fails |

## Known limitations

- **One repository per image at a time on TUM.** While a session for an image is still running, every further
  repository opened with that image reopens it (see Troubleshooting). Fixed in
  [EduIDE/EduIDE-Cloud#147](https://github.com/EduIDE/EduIDE-Cloud/pull/147); this limitation ends once that is
  deployed.
- <a id="private-repositories"></a>**Private repositories need Scorpio's GitHub module.** The extension only marks them;
  the anonymous clone fails, and Scorpio offers to sign in to GitHub (device flow) and clone with that token. This needs
  a Scorpio release with the GitHub module in the IDE image and an OAuth App client ID in the installation's
  `landingPage.sessionEnv.SCORPIO_GITHUB_CLIENT_ID`. Without them the session opens empty with a clone error.
- **The landing page shows the language picker** instead of starting at once. It auto-starts only for Artemis links,
  which carry an `artemisToken`.
- **The default branch is always cloned.** Scorpio has no branch parameter yet; the experimental `gitRef` option only
  prepares for one.
- **The built-in image lists** were checked against each installation's live `/config.js` on 22 Oct 2026. Use
  **Detect images** when an installation changes its apps.
- Mannheim's Java 25 image ships without Scorpio, so nothing is cloned there.
