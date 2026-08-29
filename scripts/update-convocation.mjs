import { Client, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";

const required = [
  "DISCORD_TOKEN",
  "CONVOCATION_CHANNEL_ID",
  "CONVOCATION_MESSAGE_ID",
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

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(process.env.CONVOCATION_CHANNEL_ID);
    if (!channel?.isTextBased()) throw new Error("Canale Discord non disponibile.");
    const message = await channel.messages.fetch(process.env.CONVOCATION_MESSAGE_ID);
    const [present, absent] = await Promise.all([
      reactionUsers(message, "✅"),
      reactionUsers(message, "❌")
    ]);
    const acceptedIds = new Set(present.map((user) => user.id));
    const finalAbsent = absent.filter((user) => !acceptedIds.has(user.id));
    const waiting = Math.max(0, entrants - present.length - finalAbsent.length);
    const fields = [
      { name: "📅 Data", value: `${event.date} · ${event.time}`, inline: true },
      { name: "🏁 Gara", value: `${event.track} · ${event.laps} giri`, inline: true },
      { name: "🌤️ Condizioni", value: `${event.weather} · ${event.tyres} set gomme`, inline: true },
      ...splitLines(present.length ? present.map((user) => `✅ ${user.name}`) : ["Nessuna conferma ancora."])
        .map((value, index) => ({ name: index ? "Presenti (continua)" : `✅ Presenti (${present.length})`, value })),
      ...splitLines(finalAbsent.length ? finalAbsent.map((user) => `❌ ${user.name}`) : ["Nessuna assenza ancora."])
        .map((value, index) => ({ name: index ? "Assenti (continua)" : `❌ Assenti (${finalAbsent.length})`, value })),
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
    await message.edit({ embeds: [embed] });
    console.log(JSON.stringify({ presenti: present.length, assenti: finalAbsent.length, attesa: waiting }));
  } finally {
    client.destroy();
  }
});

await client.login(process.env.DISCORD_TOKEN);

