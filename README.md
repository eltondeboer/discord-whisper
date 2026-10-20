# CS comms relay

Relays the voice of two team channels into a spectator channel. A mod switches each team between LIVE and muted with buttons. Audio only goes one way, so spectators can never be heard in the team channels.

Discord lets one bot account sit in only one voice channel per server, so this uses **three bot accounts**: one listens in each team channel and one plays the mix in the spectator channel.

Expected delay is about 100–200 ms on top of normal Discord voice: 40 ms of jitter buffer, about 20 ms for Opus re-encoding, plus your network.

## 1. Create 3 bots (about 5 minutes)

At https://discord.com/developers/applications, do this three times (for example "Relay A", "Relay B", "Relay Spectator"):

1. **New Application** → **Bot** → **Reset Token** → copy the token.
2. **OAuth2** → **URL Generator** → scopes `bot` and `applications.commands` → permissions **View Channels**, **Connect** and **Speak** → open the URL and add the bot to your server.

If the team channels are private, give the bots access to them.

## 2. Configure

```sh
cp .env.example .env
```

Fill in `.env`. To copy IDs, turn on Discord **Settings → Advanced → Developer Mode**, then right-click the server or a channel and choose **Copy ID**.

## 3. Run on the Proxmox NUC

In any Debian/Ubuntu LXC or VM that has Docker (a 1 vCPU, 512 MB LXC is plenty):

```sh
docker compose up -d --build
docker compose logs -f   # should show 3 "joined" lines and "Relay running"
```

The bot needs no open ports, only outbound internet access.

## 4. During the match

A mod (anyone with **Mute Members**) types `/relay` in any text channel. Both teams start **muted**. Click a team's button to switch it between LIVE and muted.

## Dev

```sh
npm install && npm test
```
