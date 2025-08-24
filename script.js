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

// Configurations des sites
const siteConfigs = [
  {
    name: "SeLoger",
    url: new URL(
      "https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=POCOFR4448&numberOfBedroomsMin=1&numberOfRoomsMin=2&priceMax=1300&spaceMin=55"
    ),
    baseUrl: "https://www.seloger.com",
    selectors: {
      card: '[data-testid="serp-core-classified-card-testid"]',
      link: "a[href]",
      title: "a[title]",
    },
  },
  {
    name: "Bienici",
    url: new URL(
      "https://www.bienici.com/recherche/location/lyon-4e-69004/2-pieces-et-plus?prix-max=1300&mode=liste"
    ),
    baseUrl: "https://www.bienici.com",
    selectors: {
      card: "article.search-results-list__ad-overview",
      link: "a[href]",
      title: ".ad-overview-details__ad-title",
      price: ".ad-price__the-price",
    },
  },
];

let scrapingInterval = null; // Pour stocker les intervals par channel
let scrapingActive = false; // Pour savoir si le scraping est actif par channel
const results = []; // Pour stocker les résultats des annonces

async function scrap(channel) {
  console.log("🔄 Démarrage du scraping...");
  let browserInstance;
  try {
    const { browser } = await initBrowser();
    browserInstance = browser;

    const allAdverts = [];

    for (const config of siteConfigs) {
      try {
        const page = await browser.newPage();
        await configurePage(page, config);
        const adverts = await getAdverts(page, config);
        allAdverts.push(...adverts);
        await page.close();
      } catch (error) {
        console.error(
          `❌ Erreur lors du scraping de ${config.name}: ${error.message}`
        );
      }
    }

    removeDeletedAdverts(allAdverts);
    const newAdverts = filterAdverts(allAdverts);
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

  return { browser };
}

async function configurePage(page, config) {
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

  const response = await page.goto(config.url.href, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  console.log(`✅ Page chargée - Status: ${response.status()}`);

  // Attendre que les annonces se chargent
  const sel = await page.waitForSelector(config.selectors.card, {
    timeout: 10000,
  });
  if (!sel) throw new Error(`❌ Éléments non trouvés pour ${config.name}`);
  console.log("✅ Éléments trouvés");
}

async function getAdverts(page, config) {
  return await page.evaluate(
    (configData) => {
      function extractTitleLinkSeLoger(card, configData) {
        const titleElement = card.querySelector(configData.selectors.title);
        title = titleElement ? titleElement.getAttribute("title") : "";

        const linkElement = card.querySelector(configData.selectors.link);
        link = linkElement ? linkElement.href : "";

        if (link) {
          link = `${configData.baseUrl}${link.split("?")[0]}`;
        }

        return { title, link };
      }

      function extractTitleLinkBienici(card, configData) {
        const titleElement = card.querySelector(
          `${configData.selectors.title}`
        );
        const priceElement = card.querySelector(
          `${configData.selectors.price}`
        );
        const titleText = titleElement ? titleElement.textContent?.trim() : "";
        const priceText = priceElement ? priceElement.textContent?.trim() : "";
        title = priceText + " - " + titleText;

        const linkElement = card.querySelector(configData.selectors.link);
        link = linkElement ? linkElement.href : "";

        if (link) {
          link = `${configData.baseUrl}${link.split("?")[0]}`;
        }

        return { title, link };
      }

      const cards = document.querySelectorAll(configData.selectors.card);
      if (!cards.length)
        throw new Error(`Aucune annonce trouvée sur ${configData.name}`);
      const newResults = [];

      cards.forEach((card) => {
        let data = {};

        // Extraction selon le site
        switch (configData.name) {
          case "SeLoger":
            data = extractTitleLinkSeLoger(card, configData);
            break;
          case "Bienici":
            data = extractTitleLinkBienici(card, configData);
            break;
        }

        newResults.push({
          title: data.title,
          link: data.link,
          source: configData.name,
        });
      });

      return newResults;
    },
    {
      name: config.name,
      baseUrl: config.baseUrl,
      selectors: config.selectors,
    }
  );
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
  const updatedResults = results.filter((result) =>
    adverts.some((ad) => ad.link === result.link)
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
🌐 **Sites surveillés:** ${siteConfigs.map((config) => config.name).join(", ")}
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
- \`!statusstp\`: Afficher le statut du scraping automatique.
      `);
    }
  });
}

startBot();

client.login(process.env.DISCORD_TOKEN);

// async function scrapDebug() {
//   console.log("🔄 Démarrage du scraping...");
//   let browserInstance;
//   try {
//     const { browser } = await initBrowser();
//     browserInstance = browser;

//     const allAdverts = [];

//     for (const config of siteConfigs) {
//       try {
//         const page = await browser.newPage();
//         await configurePage(page, config);
//         const adverts = await getAdverts(page, config);
//         allAdverts.push(...adverts);
//         await page.close();
//       } catch (error) {
//         console.error(
//           `❌ Erreur lors du scraping de ${config.name}: ${error.message}`
//         );
//       }
//     }

//     removeDeletedAdverts(allAdverts);
//     const newAdverts = filterAdverts(allAdverts);
//     await displayResultsDebug(newAdverts);
//   } catch (error) {
//     console.log(`❌ **Erreur lors du scraping:** ${error.message}`);
//   } finally {
//     if (browserInstance) {
//       await browserInstance.close();
//     }
//   }
// }

// async function displayResultsDebug(adverts) {
//   if (!adverts || adverts.length === 0) {
//     console.log("Aucune nouvelle annonce trouvée.");
//     return; // Arrêter l'exécution si aucune annonce n'est trouvée
//   }

//   const isOneResult = adverts.length === 1;
//   console.log(
//     `✅ **${adverts.length} ${
//       isOneResult
//         ? "nouvel appartement trouvé"
//         : "nouveaux appartements trouvés"
//     } !**`
//   );

//   for (const [index, annonce] of adverts.entries()) {
//     console.log(`
// **${index + 1}.** ${annonce.title}
// 🔗 ${annonce.link}
//         `);

//     // Pause pour éviter les limites de Discord
//     await new Promise((resolve) => setTimeout(resolve, 200));
//   }
// }

// scrapDebug();
