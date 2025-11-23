<p align="center"><img src="https://raw.githubusercontent.com/MercuryWorkshop/scramjet/main/assets/scramjet.png" height="200"></p>

<h1 align="center">Scramjet Demo</h1>

The demo implementation of <a href="https://github.com/MercuryWorkshop/scramjet">Scramjet</a>, the most advanced web proxy.

<a href="https://github.com/MercuryWorkshop/scramjet">Scramjet</a> is an experimental interception based web proxy designed with security, developer friendliness, and performance in mind. This project is made to evade internet censorship and bypass arbitrary web browser restrictions.

#### Refer to <a href="https://github.com/HeyPuter/browser.js">browser.js</a> where this project will now receive updates outside of just bypassing internet censorship.

## Supported Sites

Scramjet has CAPTCHA support! Some of the popular websites that Scramjet supports include:

- [Google](https://google.com)
- [Twitter](https://twitter.com)
- [Instagram](https://instagram.com)
- [Youtube](https://youtube.com)
- [Spotify](https://spotify.com)
- [Discord](https://discord.com)
- [Reddit](https://reddit.com)
- [GeForce NOW](https://play.geforcenow.com/)

Ensure you are not hosting on a datacenter IP for CAPTCHAs to work reliably along with YouTube. Heavy amounts of traffic will make some sites NOT work on a single IP. Consider rotating IPs or routing through Wireguard using a project like <a href="https://github.com/whyvl/wireproxy">wireproxy</a>.

## Setup / Usage

You will need Node.js 16.x (and above) and Git installed; below is an example for Debian/Ubuntu setup.

```
sudo apt update
sudo apt upgrade
sudo apt install curl git nginx

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20

git clone https://github.com/MercuryWorkshop/Scramjet-App
cd Scramjet-App
```

Install dependencies
```
pnpm install
```

Run the server
```
pnpm start
```

Resources for self-hosting:

- https://github.com/nvm-sh/nvm
- https://docs.titaniumnetwork.org/guides/nginx/
- https://docs.titaniumnetwork.org/guides/vps-hosting/
- https://docs.titaniumnetwork.org/guides/dns-setup/

## Resolving merge conflicts

If GitHub reports conflicts on `public/index.css`, `public/index.html`, or `public/index.js` when you open a PR:

1. Rebase your branch onto the latest `main` (or your deployment branch):
   ```sh
   git fetch origin
   git checkout work
   git rebase origin/main
   ```
2. When prompted, pick the versions from this branch (they include the latest diagnostics and settings fixes):
   ```sh
   git checkout --theirs public/index.css public/index.html public/index.js
   git add public/index.css public/index.html public/index.js
   git rebase --continue
   ```
3. Verify the build quickly:
   ```sh
   pnpm lint
   ```
4. Push the rebased branch and reopen the pull request.

If you need the other side’s changes instead, swap `--theirs` for `--ours` in step 2 and re-apply any desired diagnostics/settings tweaks afterward.

## Coolify / Traefik deployment quickstart

The bundled Dockerfile and docker-compose.yml are production-ready for a Coolify v4 host using Traefik for TLS. To avoid the routing conflicts we hit earlier, keep the client and server on the same Wisp path and let Traefik own the public ports:

- Build the container from this repo (Dockerfile) and run the compose service without a `ports:` block; Traefik will forward the domain to port `8080` internally.
- Leave `WISP_PATH` set to `/wisp/` unless you also update the Fastify/Wisp server; the client upgrades **only** on that normalized path.
- Override defaults via environment variables in Coolify: `WISP_DNS`, `DEFAULT_TRANSPORT`, `DEFAULT_SEARCH_TEMPLATE`, and `WISP_ALLOW_UDP_STREAMS` flow through to `/config.js`, `/healthz`, and the UI settings.
- Use the built-in diagnostics: open the app, check the status pill, and run the connectivity test to validate `/healthz` and the WebSocket upgrade end to end.

### HTTP Transport

The example uses [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport) to fetch proxied data encrypted.

You may also want to use [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport), a different way of fetching encrypted data.

This example also now uses [wisp-js/server](https://www.npmjs.com/package/@mercuryworkshop/wisp-js) instead of the now outdated wisp-server-node. Please note that this can also be replaced with other wisp implementations like [wisp-server-python](https://github.com/MercuryWorkshop/wisp-server-python) which is highly recommend for production.

See the [bare-mux](https://github.com/MercuryWorkshop/bare-mux) documentation for more information.
