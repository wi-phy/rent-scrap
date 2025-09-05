import { initBrowser, configurePage } from "./browser.js";

let scrapingInterval = null; // Pour stocker les intervals par channel
let scrapingActive = false; // Pour savoir si le scraping est actif par channel

// Configurations des sites
const siteConfigs = [
  {
    name: "SeLoger",
    url: new URL(
      "https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=POCOFR4448&numberOfBedroomsMin=1&numberOfRoomsMin=2&priceMax=1300&spaceMin=55"
    ),
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
    selectors: {
      card: "article.search-results-list__ad-overview",
      link: "a[href]",
      title: ".ad-overview-details__ad-title",
      price: ".ad-price__the-price",
    },
  },
];

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

async function getAdverts(page, config) {
  return await page.evaluate(
    (configData) => {
      function extractTitleLinkSeLoger(card, configData) {
        const titleElement = card.querySelector(configData.selectors.title);
        title = titleElement ? titleElement.getAttribute("title") : "";

        const linkElement = card.querySelector(configData.selectors.link);
        link = linkElement ? linkElement.href : "";

        if (link) {
          link = `${link.split("?")[0]}`;
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
          link = `${link.split("?")[0]}`;
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

export async function startAutoScrapingRent(channel) {
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

export async function stopAutoScrapingRent(channel) {
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

export async function scrapDebug() {
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
    await displayResultsDebug(newAdverts);
  } catch (error) {
    console.log(`❌ **Erreur lors du scraping:** ${error.message}`);
  } finally {
    if (browserInstance) {
      await browserInstance.close();
    }
  }
}

async function displayResultsDebug(adverts) {
  if (!adverts || adverts.length === 0) {
    console.log("Aucune nouvelle annonce trouvée.");
    return; // Arrêter l'exécution si aucune annonce n'est trouvée
  }

  const isOneResult = adverts.length === 1;
  console.log(
    `✅ **${adverts.length} ${
      isOneResult
        ? "nouvel appartement trouvé"
        : "nouveaux appartements trouvés"
    } !**`
  );

  for (const [index, annonce] of adverts.entries()) {
    console.log(`
**${index + 1}.** ${annonce.title}
🔗 ${annonce.link}
        `);

    // Pause pour éviter les limites de Discord
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
