const puppeteer = require("puppeteer");

async function scrapSeLoger() {
  const url =
    "https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=POCOFR4448&numberOfBedroomsMin=1&numberOfRoomsMin=2&priceMax=1300&spaceMin=55";

  console.log("🚀 Démarrage du scraping SeLoger...");
  console.log("📍 URL:", url);

  let browser;
  try {
    // Lancement du navigateur
    browser = await puppeteer.launch({
      headless: true, // Mettre à false pour voir le navigateur
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Configuration de la page
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768 });

    console.log("🔄 Chargement de la page...");
    const res = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    console.log(`✅ Page chargée - Status: ${res.status()}`);
    console.log(`📄 Titre de la page: ${await page.title()}`);

    // Attendre que les annonces se chargent
    console.log("⏳ Attente du chargement des annonces...");
    await page.waitForSelector(
      '[data-testid="serp-core-classified-card-testid"]',
      {
        timeout: 10000,
      }
    );

    // Extraction des données
    console.log("📊 Extraction des données...");
    const annonces = await page.evaluate(() => {
      const cards = document.querySelectorAll(
        '[data-testid="serp-core-classified-card-testid"]'
      );
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

    console.log(`✅ ${annonces.length} appartements trouvés`);

    // Affichage des résultats
    if (annonces.length > 0) {
      console.log("\n📋 RÉSULTATS:");
      console.log("=".repeat(80));

      annonces.forEach((annonce, index) => {
        console.log(`\n${index + 1}. ${annonce.title}`);
        console.log(`   🔗 Lien: ${annonce.link}`);
        console.log("-".repeat(80));
      });
    }
  } catch (error) {
    console.error("❌ Erreur lors du scraping:", error.message);

    if (error.message.includes("timeout")) {
      console.error(
        "💡 Suggestion: Le site met du temps à charger. Essayez d'augmenter le timeout ou vérifiez votre connexion."
      );
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Exécution du script
if (require.main === module) {
  console.log("🏠 SeLoger Scraper - Recherche d'appartements à louer");
  console.log("=".repeat(60));
  scrapSeLoger();
}

module.exports = { scrapSeLoger };
