# CS comms relay

Relays the voice of two team channels into a spectator channel. A mod switches each team between LIVE and muted with buttons. Audio only goes one way, so spectators can never be heard in the team channels.

Discord lets one bot account sit in only one voice channel per server, so this uses **three bot accounts**: one listens in each team channel and one plays the mix in the spectator channel.

Expected delay is about 100–200 ms on top of normal Discord voice: 40 ms of jitter buffer, about 20 ms for Opus re-encoding, plus your network.

## 1. Create 3 bots (about 5 minutes)

At https://discord.com/developers/applications, do this three times (for example "Relay A", "Relay B", "Relay Spectator"):

1. **New Application** → **Bot** → **Reset Token** → copy the token. On the same page, turn **Public Bot** off, so only you can add the bot to a server and nobody can pull the relay into theirs.
2. **OAuth2** → **URL Generator** → scopes `bot` and `applications.commands` → permissions **View Channels**, **Connect** and **Speak** → open the URL and add the bot to your server.

If the team channels are private, give the bots access to them.

## 2. Configure

```sh
cp .env.example .env
```

Put the 3 bot tokens in `.env`. Team names are optional. No server or channel IDs are needed.

## 3. Run on the Proxmox NUC

In any Debian/Ubuntu LXC or VM that has Docker (a 1 vCPU, 512 MB LXC is plenty):

```sh
docker compose up -d --build
docker compose logs -f   # should show "Relay running"
```

The bot needs no open ports, only outbound internet access.

## 4. During the match

A mod (anyone with **Mute Members**) does the following:

1. Join team 1's voice channel and run `/join bot:Team A listener`. Do the same for team 2 and for the spectator channel (`Spectator speaker`). Running `/join` again moves a bot.
2. Run `/relay` in any text channel. Both teams start **muted**. Click a team's button to switch it between LIVE and muted.

After a restart, the bots leave their channels, so run `/join` again.

## Dev

```sh
npm install && npm test
```
