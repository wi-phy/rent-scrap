import puppeteer from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

export async function initBrowser() {
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

export async function configurePage(page, config, pageNumber) {
  // Ignorer les erreurs SSL au niveau de la page
  if (!page._requestInterceptionEnabled) {
    await page.setRequestInterception(true);
    page._requestInterceptionEnabled = true; // Marquer comme activé
    
    page.on("request", (req) => {
      // Bloquer les ressources inutiles pour accélérer le chargement
      if (req.resourceType() === 'image' || 
          req.resourceType() === 'stylesheet' || 
          req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  // Configuration de la page
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 768 });

  const response = await page.goto(
    `${
      pageNumber
        ? `${config.url.href}${config.pagination}${pageNumber}`
        : config.url.href
    }`,
    {
      waitUntil: "networkidle2",
      timeout: 30000,
    }
  );

  console.log(`✅ Page chargée - Status: ${response.status()}`);

  // Attendre que les annonces se chargent
  try{
    await page.waitForSelector(config.selectors.card, {
      timeout: 5000,
    });
    return true;
  } catch (error) {
    return false;
  }
}
