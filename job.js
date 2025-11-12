import { initBrowser, configurePage } from "./browser.js";

let scraping = {
  nice: {
    timeout: null,
    isActive: false,
  },
  lyon: {
    timeout: null,
    isActive: false,
  },
};

// Configurations des sites
const siteConfigs = [
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=coordinateur+p%C3%A9dagogique&k_autocomplete=&l=nice&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "nice",
  },
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=Responsable+p%C3%A9dagogique&k_autocomplete=http%3A%2F%2Fwww.rj.com%2FCommun%2FPost%2FResponsable_pedagogique&l=nice&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "nice",
  },
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=R%C3%A9f%C3%A9rent+p%C3%A9dagogique&k_autocomplete=&l=nice&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "nice",
  },
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=responsable+p%C3%A9dagogique&k_autocomplete=&l=lyon&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "lyon",
  },
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=r%C3%A9f%C3%A9rent+p%C3%A9dagogique&k_autocomplete=&l=lyon&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "lyon",
  },
  {
    name: "HelloWork",
    url: new URL(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=coordinateur+p%C3%A9dagogique&k_autocomplete=&l=lyon&l_autocomplete=&st=date&c=CDI&c=CDD&cod=all&msa=30000&ray=20&d=m"
    ),
    pagination: "&p=",
    pageSize: 30,
    selectors: {
      card: '[data-id-storage-target="item"]',
      link: "a[href]",
      title: "a[title]",
    },
    location: "lyon",
  },
];

const results = {
  nice: [],
  lyon: [],
}; // Pour stocker les résultats des annonces

export async function scrapJobs(channel, location) {
  console.log("🔄 Démarrage du scraping...");
  let browserInstance;
  try {
    const { browser } = await initBrowser();
    browserInstance = browser;

    const allAdverts = [];

    for (const config of siteConfigs.filter(
      (site) => site.location === location
    )) {
      try {
        const page = await browser.newPage();

        const isPageConfigured = await configurePage(
          page,
          config,
          1
        );
        if (isPageConfigured) {
          const adverts = await getAdverts(page, config);
          allAdverts.push(...adverts);
        }

        await page.close();
      } catch (error) {
        channel.send(
          `❌ Erreur lors du scraping de ${config.name}: ${error.message}`
        );
      }
    }

    removeDeletedAdverts(allAdverts, location);
    const newAdverts = filterAdverts(allAdverts, location);
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
      function extractInfosHelloWork(card, configData) {
        const titleElement = card.querySelector(configData.selectors.title);
        const title = titleElement ? titleElement.getAttribute("title") : "";

        const linkElement = card.querySelector(configData.selectors.link);
        let link = linkElement ? linkElement.href : "";

        if (link) {
          link = `${link.split("?")[0]}`;
        }

        // Extraction des informations supplémentaires
        const localisationElement = card.querySelector(
          '[data-cy="localisationCard"]'
        );
        const localisation = localisationElement
          ? localisationElement.textContent.trim()
          : "";

        const contractElement = card.querySelector('[data-cy="contractCard"]');
        const contract = contractElement
          ? contractElement.textContent.trim()
          : "";

        // Pour le salaire, on cherche dans le même container (div parent)
        let salary = "";
        if (localisationElement) {
          const container = localisationElement.parentElement; // Le div avec tw-flex tw-gap-3
          const salaryElement = container.querySelector(
            ".tw-typo-s-bold:not([data-cy])"
          ); // Élément avec tw-typo-s-bold mais sans data-cy
          salary = salaryElement ? salaryElement.textContent.trim() : "";
        }

        return {
          title,
          link,
          localisation,
          contract,
          salary,
        };
      }

      const cards = document.querySelectorAll(configData.selectors.card);
      if (!cards.length) {
        console.log(`Aucune annonce trouvée sur ${configData.name}`);
        return null;
      }
      const newResults = [];

      cards.forEach((card) => {
        let data = {};

        // Extraction selon le site
        switch (configData.name) {
          case "HelloWork":
            data = extractInfosHelloWork(card, configData);
            break;
        }

        if (data.salary.includes("heure")) return;

        // Filter out adverts with excluded keywords in title
        const excludedKeywords = ["santé", "médecin", "medecin", "infirmier", "medical"];
        const titleLower = (data.title || "").toLowerCase();
        if (excludedKeywords.some(keyword => titleLower.includes(keyword.toLowerCase()))) {
          return;
        }

        newResults.push({ ...data });
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

function filterAdverts(adverts, location) {
  return adverts.filter((ad) => {
    if (results[location].some((result) => result.link === ad.link)) {
      return false; // Annonce déjà existante, ne pas l'ajouter
    }
    results[location].push(ad); // Nouvelle annonce, ajouter à la liste
    return true;
  });
}

function removeDeletedAdverts(adverts, location) {
  const initialCount = results[location].length;
  const updatedResults = results[location].filter((result) =>
    adverts.some((ad) => ad.link === result.link)
  );
  results[location].length = 0;
  results[location].push(...updatedResults);
  const updatedCount = results[location].length;
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
  channel.send(
    `✅ **${adverts.length} ${
      isOneResult ? "nouvelle annonce trouvée" : "nouvelles annonces trouvées"
    } !**`
  );

  for (const [index, annonce] of adverts.entries()) {
    await channel.send(`
**${index + 1}.** ${annonce.title}
  📍 **Localisation:** ${annonce.localisation}
  💼 **Contrat:** ${annonce.contract}
  💰 **Salaire:** ${annonce.salary}
  🔗 <${annonce.link}>
━━━━━━━━━━━━━
        `);

    // Pause pour éviter les limites de Discord
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Helper function to get current hour in GMT+1
function getCurrentHourGMT1() {
  const now = new Date();
  // Get UTC time and add 1 hour for GMT+1
  const gmt1Hour = now.getUTCHours() + 1;
  return gmt1Hour >= 24 ? gmt1Hour - 24 : gmt1Hour;
}

// Helper function to get current day of week in GMT+1 (0 = Sunday, 6 = Saturday)
function getCurrentDayGMT1() {
  const now = new Date();
  // Get UTC day and adjust for GMT+1 timezone
  // Create a date object in GMT+1 timezone
  const gmt1Date = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return gmt1Date.getDay();
}

// Helper function to check if it's weekend (Saturday or Sunday)
function isWeekend() {
  const day = getCurrentDayGMT1();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

// Helper function to check if it's day time (8h - 18h GMT+1)
function isDayTime() {
  const hour = getCurrentHourGMT1();
  return hour >= 8 && hour < 18;
}

// Helper function to calculate next interval in milliseconds
function getNextInterval() {
  if (isWeekend()) {
    // Weekend: check every 8 hours
    return 8 * 60 * 60 * 1000; // 8 hours
  } else if (isDayTime()) {
    // Day time: check every 2 hours
    return 2 * 60 * 60 * 1000; // 2 hours
  } else {
    // Night time: check every 7 hours
    return 7 * 60 * 60 * 1000; // 7 hours
  }
}

// Schedule next scraping run
function scheduleNextScraping(channel, location) {
  if (!scraping[location].isActive) {
    return;
  }

  const interval = getNextInterval();

  scraping[location].timeout = setTimeout(async () => {
    await scrapJobs(channel, location);
    scheduleNextScraping(channel, location);
  }, interval);
}

export async function startAutoScrapingJobs(channel, location) {
  if (scraping[location].isActive) {
    // await channel.send("⚠️ **Le scraping automatique est déjà en cours !**");
    return;
  }

  scraping[location].isActive = true;

  // Obtenir les noms uniques des sites
  const uniqueSites = [
    ...new Set(
      siteConfigs
        .filter((config) => config.location === location)
        .map((config) => config.name)
    ),
  ];

  await channel.send(`
🚀 **Démarrage du scraping automatique !**
🌐 **Sites surveillés:** ${uniqueSites.join(", ")}
⏰ **Fréquence:** 
   - Week-end (Samedi/Dimanche): Toutes les 8h
   - Journée (8h-18h GMT+1): Toutes les 2h
   - Nuit (18h-8h GMT+1): Toutes les 7h
💡 **Utilisez \`!stopjobs${location}\` pour arrêter le scraping automatique.**
  `);

  // Premier scraping immédiat
  await scrapJobs(channel, location);

  // Programmer les scraping suivants avec intervalles dynamiques
  scheduleNextScraping(channel, location);
}

export async function stopAutoScrapingJobs(channel, location) {
  if (!scraping[location].isActive) {
    await channel.send("⚠️ **Aucun scraping automatique en cours.**");
    return;
  }

  if (scraping[location].timeout) {
    clearTimeout(scraping[location].timeout);
    scraping[location].timeout = null;
  }

  scraping[location].isActive = false;

  await channel.send("🛑 **Scraping automatique arrêté.**");
}

export async function scrapJobsDebug(location) {
  console.log("🔄 Démarrage du scraping...");
  let browserInstance;
  try {
    const { browser } = await initBrowser();
    browserInstance = browser;

    const allAdverts = [];

    for (const config of siteConfigs.filter(
      (site) => site.location === location
    )) {
      try {
        const page = await browser.newPage();

        const isPageConfigured = await configurePage(
          page,
          config,
          1
        );
        if (isPageConfigured) {
          const adverts = await getAdverts(page, config);
          allAdverts.push(...adverts);
        }

        await page.close();
      } catch (error) {
        console.log(
          `❌ Erreur lors du scraping de ${config.name}: ${error.message}`
        );
      }
    }

    removeDeletedAdverts(allAdverts, location);
    const newAdverts = filterAdverts(allAdverts, location);
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
      isOneResult ? "nouvelle annonce trouvée" : "nouvelles annonces trouvées"
    } !**`
  );

  for (const [index, annonce] of adverts.entries()) {
    console.log(`
**${index + 1}.** ${annonce.title}
📍 **Localisation:** ${annonce.localisation}
💼 **Contrat:** ${annonce.contract}
💰 **Salaire:** ${annonce.salary}
🔗 ${annonce.link}
        `);

    // Pause pour éviter les limites de Discord
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
