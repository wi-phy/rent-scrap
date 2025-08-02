import dotenv from "dotenv";
import puppeteer from "puppeteer";
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

const url = new URL(
  "https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=POCOFR4448&numberOfBedroomsMin=1&numberOfRoomsMin=2&priceMax=1300&spaceMin=55"
);

let scrapingInterval = null; // Pour stocker les intervals par channel
let scrapingActive = false; // Pour savoir si le scraping est actif par channel
const results = []; // Pour stocker les résultats des annonces

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
  console.log("🔄 Démarrage du scraping...");
  let browserInstance;
  try {
    const { page, browser } = await initBrowser();
    browserInstance = browser;
    const adverts = await getAdverts(page);
    removeDeletedAdverts(adverts);
    const newAdverts = filterAdverts(adverts);
    await displayResults(channel, newAdverts);
  } catch (error) {
    await channel.send(`❌ **Erreur lors du scraping:** ${error.message}`);
  } finally {
    if (browserInstance) {
      await browserInstance.close();
    }
  }
}

async function initBrowser() {
  // Lancement du navigateur
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-web-security",
      "--allow-running-insecure-content",
    ],
  });

  const page = await browser.newPage();

  // Ignorer les erreurs SSL au niveau de la page
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    req.continue();
  });

  // Configuration de la page
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  const response = await page.goto(url.href, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  console.log(`✅ Page chargée - Status: ${response.status()}`);

  // Attendre que les annonces se chargent
  const sel = await page.waitForSelector(
    '[data-testid="serp-core-classified-card-testid"]',
    {
      timeout: 10000,
    }
  );
  console.log(`${sel ? "✅ Elément trouvé" : "❌ Elément non trouvé"}`);

  return { page, browser };
}

async function getAdverts(page) {
  return await page.evaluate(() => {
    const cards = document.querySelectorAll(
      '[data-testid="serp-core-classified-card-testid"]'
    );
    if (!cards.length) throw new Error("Aucune annonce trouvée");
    const newResults = [];

    cards.forEach((card) => {
      try {
        // Extraction du lien
        const linkElement = card.querySelector("a[href]");
        const link = linkElement ? linkElement.href : "";

        // Recherche du titre
        const titleElement = card.querySelector("a[title]");
        let title = "";
        if (titleElement) {
          title =
            titleElement.textContent?.trim() ||
            titleElement.getAttribute("title") ||
            "";
        }

        newResults.push({
          title,
          link: link.startsWith("http")
            ? link
            : `https://www.seloger.com${link}`,
        });
      } catch (error) {
        console.error("Erreur lors de l'extraction d'une annonce:", error);
      }
    });

    return newResults;
  });
}

function filterAdverts(adverts) {
  return adverts.filter((ad) => {
    if (results.some((result) => result.link === ad.link)) {
      return false; // Annonce déjà existante, ne pas l'ajouter
    }
    results.push(ad); // Nouvelle annonce, ajouter à la liste
    return true;
  });
}

function removeDeletedAdverts(adverts) {
  const initialCount = results.length;
  const updatedResults = results.filter(result => 
    adverts.some(ad => ad.link === result.link)
  );
  results.length = 0;
  results.push(...updatedResults);
  const updatedCount = results.length;
  if (initialCount > updatedCount) {
    console.log(`🗑️ ${initialCount - updatedCount} annonces supprimées.`);
  }
}

async function displayResults(channel, adverts) {
  if (!adverts || adverts.length === 0) {
    console.log("Aucune nouvelle annonce trouvée.");
    return; // Arrêter l'exécution si aucune annonce n'est trouvée
  }

  const isOneResult = adverts.length === 1;
  await channel.send(
    `✅ **${adverts.length} ${
      isOneResult
        ? "nouvel appartement trouvé"
        : "nouveaux appartements trouvés"
    } !**`
  );

  for (const [index, annonce] of adverts.entries()) {
    await channel.send(`
**${index + 1}.** ${annonce.title}
🔗 ${annonce.link}
        `);

    // Pause pour éviter les limites de Discord
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function startAutoScraping(channel) {
  if (scrapingActive) {
    await channel.send("⚠️ **Le scraping automatique est déjà en cours !**");
    return;
  }

  scrapingActive = true;

  await channel.send(`
🚀 **Démarrage du scraping automatique !**
💡 **Utilisez \`!stop\` pour arrêter le scraping automatique.**
  `);

  // Premier scraping immédiat
  await scrap(channel);

  // Programmer les scraping suivants toutes les 15 minutes
  scrapingInterval = setInterval(async () => {
    await scrap(channel);
  }, 15 * 60 * 1000); // 15 minutes
}

async function stopAutoScraping(channel) {
  if (!scrapingActive) {
    await channel.send("⚠️ **Aucun scraping automatique en cours.**");
    return;
  }

  if (scrapingInterval) {
    clearInterval(scrapingInterval);
    scrapingInterval = null;
  }

  scrapingActive = false;

  await channel.send("🛑 **Scraping automatique arrêté.**");
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

    // Commande !scrapplz
    if (message.content === "!scrapplz") {
      await startAutoScraping(message.channel);
    }

    // Commande !stopplz
    if (message.content === "!stopplz") {
      await stopAutoScraping(message.channel);
    }

    if (message.content === "!criteriastp") {
      await criteria(message.channel);
    }

    if (message.content === "!statusstp") {
      if (scrapingActive) {
        await message.channel.send(
          "✅ **Scraping automatique ACTIF** - prochain scraping dans < 15 minutes"
        );
      } else {
        await message.channel.send("❌ **Scraping automatique INACTIF**");
      }
    }

    // Commande !help
    if (message.content === "!help") {
      await message.channel.send(`
**Commandes disponibles:**
- \`!scrapplz\`: Lancer le scraping des annonces.
- \`!stopplz\`: Arrêter le scraping automatique.
- \`!criteriastp\`: Afficher les critères de recherche.
- \`!statusstp\`: Afficher le statut du scraping automatique.
      `);
    }
  });
}

startBot();

client.login(process.env.DISCORD_TOKEN);
