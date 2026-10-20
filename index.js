import { Readable } from 'node:stream';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits,
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import {
  createAudioPlayer, createAudioResource, EndBehaviorType, entersState, joinVoiceChannel,
  NoSubscriberBehavior, StreamType, VoiceConnectionStatus,
} from '@discordjs/voice';
import opus from '@discordjs/opus';
import { mix } from './mix.js';

const env = process.env;
for (const k of ['GUILD_ID', 'TEAM_A_TOKEN', 'TEAM_A_CHANNEL', 'TEAM_B_TOKEN', 'TEAM_B_CHANNEL', 'SPECTATOR_TOKEN', 'SPECTATOR_CHANNEL']) {
  if (!env[k]) throw new Error(`Missing env var ${k}`);
}

const FRAME_MS = 20;
const JITTER_FRAMES = 2; // buffer 40ms per speaker before playing to absorb network jitter
const MAX_QUEUE = 5; // drop old audio past 100ms so the relay never drifts behind live
const MAX_OUT = 3;

const teams = {
  a: { name: env.TEAM_A_NAME || 'Team A', token: env.TEAM_A_TOKEN, channel: env.TEAM_A_CHANNEL, live: false, speakers: new Map() },
  b: { name: env.TEAM_B_NAME || 'Team B', token: env.TEAM_B_TOKEN, channel: env.TEAM_B_CHANNEL, live: false, speakers: new Map() },
};

async function login(token) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const ready = new Promise((resolve) => client.once(Events.ClientReady, resolve));
  await client.login(token);
  await ready;
  return client;
}

async function join(client, channelId, group, listen) {
  const guild = await client.guilds.fetch(env.GUILD_ID);
  const conn = joinVoiceChannel({
    guildId: guild.id, channelId, group, adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: !listen, selfMute: listen,
  });
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      conn.rejoin();
    }
  });
  conn.on('error', (e) => console.error(`[${group}] voice error`, e));
  await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
  console.log(`[${group}] joined ${channelId}`);
  return conn;
}

function listen(team, conn) {
  conn.receiver.speaking.on('start', (userId) => {
    if (team.speakers.has(userId)) return;
    const queue = [];
    team.speakers.set(userId, queue);
    const decoder = new opus.OpusEncoder(48000, 2);
    conn.receiver
      .subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } })
      .on('data', (packet) => {
        if (!team.live) return;
        try {
          queue.push(decoder.decode(packet));
        } catch {
          return; // corrupt packet, skip it
        }
        if (queue.length > MAX_QUEUE) queue.shift();
      })
      .on('error', (e) => console.error(`receive error ${userId}`, e))
      .once('close', () => team.speakers.delete(userId));
  });
}

const out = new Readable({ objectMode: true, read() {} });
const encoder = new opus.OpusEncoder(48000, 2);

function tick() {
  const frames = [];
  for (const team of Object.values(teams)) {
    for (const q of team.speakers.values()) {
      if (!team.live) q.length = 0;
      if (q.length >= JITTER_FRAMES || (q.playing && q.length)) {
        frames.push(q.shift());
        q.playing = true;
      } else {
        q.playing = false;
      }
    }
  }
  if (frames.length && out.readableLength < MAX_OUT) out.push(encoder.encode(mix(frames)));
}

// Schedules from a fixed start time because setInterval drifts and causes audible gaps.
function startClock() {
  const start = performance.now();
  let n = 0;
  const loop = () => {
    while (performance.now() - start >= n * FRAME_MS) { tick(); n++; }
    setTimeout(loop, start + n * FRAME_MS - performance.now());
  };
  loop();
}

function panel() {
  return {
    content: 'Spectator relay — click to toggle what spectators hear.',
    components: [new ActionRowBuilder().addComponents(
      Object.entries(teams).map(([key, t]) => new ButtonBuilder()
        .setCustomId(`toggle:${key}`)
        .setLabel(`${t.name}: ${t.live ? 'LIVE' : 'muted'}`)
        .setStyle(t.live ? ButtonStyle.Success : ButtonStyle.Secondary)),
    )],
  };
}

const spectator = await login(env.SPECTATOR_TOKEN);
await spectator.application.commands.create(
  new SlashCommandBuilder()
    .setName('relay')
    .setDescription('Show the team comms relay controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),
  env.GUILD_ID,
);

spectator.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === 'relay') return await i.reply(panel());
    if (!i.isButton() || !i.customId.startsWith('toggle:')) return;
    // Anyone who can see the panel can click, so re-check the mod permission here.
    if (!i.memberPermissions?.has(PermissionFlagsBits.MuteMembers)) {
      return await i.reply({ content: 'Mods only.', flags: MessageFlags.Ephemeral });
    }
    const team = teams[i.customId.split(':')[1]];
    team.live = !team.live;
    console.log(`${team.name} ${team.live ? 'LIVE' : 'muted'} by ${i.user.tag}`);
    await i.update(panel());
  } catch (e) {
    console.error('interaction error', e);
  }
});

const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: Infinity },
});
player.on('error', (e) => console.error('player error', e));
player.play(createAudioResource(out, { inputType: StreamType.Opus }));
(await join(spectator, env.SPECTATOR_CHANNEL, 'spectator', false)).subscribe(player);

for (const [key, team] of Object.entries(teams)) {
  listen(team, await join(await login(team.token), team.channel, key, true));
}

startClock();
console.log('Relay running. Use /relay in Discord to open the controls.');
