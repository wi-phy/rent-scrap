import dotenv from "dotenv";
import {
  scrapDebug,
  startAutoScrapingRent,
  stopAutoScrapingRent,
} from "./rent.js";
import {
  scrapJobsDebug,
  startAutoScrapingJobs,
  stopAutoScrapingJobs,
} from "./job.js";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config({ quiet: true });

// Configuration du bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function startBot() {
  // Événement quand le bot est prêt
  client.once("ready", () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}!`);
  });

  // Événement pour les messages
  client.on("messageCreate", async (message) => {
    // Ignorer les messages du bot lui-même
    if (message.author.bot) return;

    // Commande !scrapappart
    if (message.content === "!scrapappart") {
      await startAutoScrapingRent(message.channel);
    }

    // Commande !stopappart
    if (message.content === "!stopappart") {
      await stopAutoScrapingRent(message.channel);
    }

    // Commande !scrapjobslyon
    if (message.content === "!scrapjobslyon") {
      await startAutoScrapingJobs(message.channel, "lyon");
    }

    // Commande !stopjobslyon
    if (message.content === "!stopjobslyon") {
      await stopAutoScrapingJobs(message.channel, "lyon");
    }

    // Commande !scrapjobsnice
    if (message.content === "!scrapjobsnice") {
      await startAutoScrapingJobs(message.channel, "nice");
    }

    // Commande !stopjobsnice
    if (message.content === "!stopjobsnice") {
      await stopAutoScrapingJobs(message.channel, "nice");
    }
  });
}

startBot();

client.login(process.env.DISCORD_TOKEN);

// scrapDebug();
