import dotenv from "dotenv";
import puppeteer from "puppeteer";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();

// Configuration du bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const url = new URL(
  "https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=POCOFR4448&numberOfBedroomsMin=1&numberOfRoomsMin=2&priceMax=1300&spaceMin=55"
);

async function criteria(channel) {
  // Extraction des paramètres de recherche de l'URL
  const urlParams = url.searchParams;
  const site = url.hostname;
  const nbChambreMin = urlParams.get("numberOfBedroomsMin") || "N/A";
  const nbPiecesMin = urlParams.get("numberOfRoomsMin") || "N/A";
  const prixMax = urlParams.get("priceMax") || "N/A";
  const surfaceMin = urlParams.get("spaceMin") || "N/A";

  // Envoyer les critères de recherche sur Discord
  await channel.send(`
**📊 CRITÈRES DE RECHERCHE:**
🌐 **Site:** ${site}
🛏️ **Nb de chambres min:** ${nbChambreMin}
🏠 **Nb de pièces min:** ${nbPiecesMin}
💰 **Prix max:** ${prixMax}€
📐 **Surface min:** ${surfaceMin}m²
  `);
}

async function scrap(channel) {
  let browser;
  try {
    const page = await loadPage();
    const adverts = await getAdverts(page);
    await displayResults(channel, adverts);
  } catch (error) {
    await channel.send(`❌ **Erreur lors du scraping:** ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function loadPage(browser) {
  // Lancement du navigateur
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();

  // Configuration de la page
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(url.href, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Attendre que les annonces se chargent
  await page.waitForSelector(
    '[data-testid="serp-core-classified-card-testid"]',
    {
      timeout: 10000,
    }
  );

  return page;
}

async function getAdverts(page) {
  return await page.evaluate(() => {
    const cards = document.querySelectorAll(
      '[data-testid="serp-core-classified-card-testid"]'
    );
    if (!cards.length) throw new Error("Aucune annonce trouvée");
    const results = [];

    cards.forEach((card) => {
      try {
        // Recherche du titre
        const titleElement = card.querySelector("a[title]");

        let title = "";
        if (titleElement) {
          title =
            titleElement.textContent?.trim() ||
            titleElement.getAttribute("title") ||
            "";
        }

        // Extraction du lien
        const linkElement = card.querySelector("a[href]");
        const link = linkElement ? linkElement.href : "";

        results.push({
          title,
          link: link.startsWith("http")
            ? link
            : `https://www.seloger.com${link}`,
        });
      } catch (error) {
        console.error("Erreur lors de l'extraction d'une annonce:", error);
      }
    });

    return results;
  });
}

async function displayResults(channel, adverts) {
  await channel.send(
    `✅ **${adverts.length} appartements trouvés !** (limité à 3 pdt la phase de tests)`
  );

  // Affichage des résultats
  if (adverts.length > 0) {
    const limit = 3; // a enlever
    adverts.forEach(async (annonce, index) => {
      if (index >= limit) return; // Limite le nombre d'annonces affichées
      await channel.send(`
**${index + 1}.** ${annonce.title}
🔗 ${annonce.link}
        `);

      // Pause pour éviter les limites de Discord
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  }
}

function startBot() {
  // Événement quand le bot est prêt
  client.once("ready", () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}!`);
  });

  // Événement pour les messages
  client.on("messageCreate", async (message) => {
    // Ignorer les messages du bot lui-même
    if (message.author.bot) return;

    // Commande !scrap
    if (message.content === "!scrap") {
      await scrap(message.channel);
    }

    if (message.content === "!criteria") {
      await criteria(message.channel);
    }

    // Commande !help
    if (message.content === "!help") {
      await message.channel.send(`
**Commandes disponibles:**
- \`!scrap\`: Lancer le scraping des annonces.
- \`!criteria\`: Afficher les critères de recherche.
      `);
    }
  });
}

startBot();

client.login(process.env.DISCORD_TOKEN);
