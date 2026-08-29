import { Client, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";

const required = [
  "DISCORD_TOKEN",
  "CONVOCATION_CHANNEL_ID",
  "CONVOCATION_ENTRANTS"
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const event = {
  track: process.env.CONVOCATION_TRACK ?? "Gara da definire",
  date: process.env.CONVOCATION_DATE ?? "Data da definire",
  time: process.env.CONVOCATION_TIME ?? "Orario da definire",
  weather: process.env.CONVOCATION_WEATHER ?? "Da definire",
  laps: process.env.CONVOCATION_LAPS ?? "—",
  tyres: process.env.CONVOCATION_TYRES ?? "—",
  logoUrl: process.env.CONVOCATION_LOGO_URL
};
const entrants = Number(process.env.CONVOCATION_ENTRANTS);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function splitLines(lines, limit = 1000) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if ((current ? `${current}\n${line}` : line).length > limit) {
      chunks.push(current);
      current = line;
    } else current = current ? `${current}\n${line}` : line;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function reactionUsers(message, emoji) {
  const reaction = message.reactions.cache.find((item) => item.emoji.name === emoji);
  if (!reaction) return [];
  const users = await reaction.users.fetch();
  return [...users.values()]
    .filter((user) => user.id !== client.user.id)
    .map((user) => ({ id: user.id, name: user.globalName ?? user.username }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function buildEmbed(present, absent) {
  const waiting = Math.max(0, entrants - present.length - absent.length);
  const fields = [
    { name: "📅 Data", value: `${event.date} · ${event.time}`, inline: true },
    { name: "🏁 Gara", value: `${event.track} · ${event.laps} giri`, inline: true },
    { name: "🌤️ Condizioni", value: `${event.weather} · ${event.tyres} set gomme`, inline: true },
    ...splitLines(present.length ? present.map((user) => `✅ ${user.name}`) : ["Nessuna conferma ancora."])
      .map((value, index) => ({ name: index ? "Presenti (continua)" : `✅ Presenti (${present.length})`, value })),
    ...splitLines(absent.length ? absent.map((user) => `❌ ${user.name}`) : ["Nessuna assenza ancora."])
      .map((value, index) => ({ name: index ? "Assenti (continua)" : `❌ Assenti (${absent.length})`, value })),
    { name: "⏳ In attesa", value: `${waiting} su ${entrants} convocati` },
    { name: "Come rispondere", value: "Reagisci con una sola opzione: ✅ Presente oppure ❌ Assente." }
  ];
  const embed = new EmbedBuilder()
    .setColor(0xF2B705)
    .setTitle(`Convocazione — CIN Truck Series | ${event.track}`)
    .setDescription("Riepilogo aggiornato delle disponibilità.")
    .addFields(fields)
    .setFooter({ text: "CIN Cup eSports Series · Convocazione automatica" })
    .setTimestamp();
  if (event.logoUrl) embed.setThumbnail(event.logoUrl);
  return { embed, waiting };
}

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(process.env.CONVOCATION_CHANNEL_ID);
    if (!channel?.isTextBased()) throw new Error("Canale Discord non disponibile.");
    let message;
    try {
      message = await channel.messages.fetch(process.env.CONVOCATION_MESSAGE_ID);
    } catch (error) {
      if (error.code !== 10008) throw error;
      const recent = await channel.messages.fetch({ limit: 100 });
      message = recent.find((candidate) => candidate.author.id === client.user.id
        && candidate.embeds.some((embed) => embed.footer?.text === "CIN Cup eSports Series · Convocazione automatica"));
      if (!message) {
        const initial = buildEmbed([], []);
        message = await channel.send({
          content: process.env.CONVOCATION_ROLE_ID ? `<@&${process.env.CONVOCATION_ROLE_ID}>` : undefined,
          allowedMentions: process.env.CONVOCATION_ROLE_ID ? { roles: [process.env.CONVOCATION_ROLE_ID] } : undefined,
          embeds: [initial.embed]
        });
        await message.react("✅");
        await message.react("❌");
      }
    }
    const [present, absent] = await Promise.all([
      reactionUsers(message, "✅"),
      reactionUsers(message, "❌")
    ]);
    const acceptedIds = new Set(present.map((user) => user.id));
    const finalAbsent = absent.filter((user) => !acceptedIds.has(user.id));
    const result = buildEmbed(present, finalAbsent);
    await message.edit({ embeds: [result.embed] });
    console.log(JSON.stringify({ presenti: present.length, assenti: finalAbsent.length, attesa: result.waiting }));
  } finally {
    client.destroy();
  }
});

await client.login(process.env.DISCORD_TOKEN);

