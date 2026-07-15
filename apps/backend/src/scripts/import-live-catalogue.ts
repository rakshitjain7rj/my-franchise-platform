import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import axios from "axios";
import * as cheerio from "cheerio";
import FranchiseProductLink from "../links/franchise-product";
import StoreLocationStockLocationLink from "../links/store-location-stock-location";

// Configure ingestion limit (configurable via IMPORT_LIMIT environment variable, defaults to 50)
const PRODUCT_LIMIT = process.env.IMPORT_LIMIT ? parseInt(process.env.IMPORT_LIMIT, 10) : 50;
// Starting stock quantity seeded at every franchise stock location for imported variants.
const IMPORT_STOCK_QTY = process.env.IMPORT_STOCK_QTY ? parseInt(process.env.IMPORT_STOCK_QTY, 10) : 50;
const BASE_URL = "https://eggfreecakebreak.com";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

// Exclude these static pages
const IGNORED_PATHS = [
  "/about-us",
  "/contact",
  "/apply-franchise",
  "/cancellations-returns",
  "/privacy-policy",
  "/terms-and-conditions",
  "/gdpr",
  "/privacy-policy-cookie-restriction-mode",
  "/customer/",
  "/checkout",
  "/cakes?",
  "/cakes/",
];

interface ScrapedProduct {
  title: string;
  handle: string;
  sku: string;
  description: string;
  basePrice: number;
  images: string[];
  options: {
    title: string;
    values: string[];
    priceAdjustments: Record<string, number>;
  }[];
}

export default async function importLiveCatalogue({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const pgConnection = container.resolve("__pg_connection__");

  const productService = container.resolve(Modules.PRODUCT);
  const inventoryService = container.resolve(Modules.INVENTORY);
  const pricingService = container.resolve(Modules.PRICING);
  const franchiseService = container.resolve("franchise");

  logger.info("Starting live catalog ingestion from eggfreecakebreak.com...");

  // 1. Get Franchise
  const existingFranchises = await franchiseService.listFranchises();
  const franchise = existingFranchises[0];
  if (!franchise) {
    logger.error("No franchise found. Run franchise seed first.");
    return;
  }
  logger.info(`Linking products to Franchise ID: ${franchise.id}`);

  // 2. Get Sales Channel
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "Default Sales Channel" },
  });
  const salesChannelId = salesChannels?.[0]?.id as string | undefined;
  if (!salesChannelId) {
    logger.error("Default Sales Channel not found. Seed first.");
    return;
  }

  // 3. Get Default Shipping Profile
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const defaultProfileId = shippingProfiles?.[0]?.id as string | undefined;

  // 3b. Resolve the franchise's stock locations (one per store, via
  //     store-location <-> stock-location link) so imported variants get
  //     inventory levels at every branch, not just an unlinked inventory item.
  const franchiseStoreLocations = await franchiseService.listStoreLocations(
    { franchise_id: franchise.id },
    { select: ["id"] }
  );
  const franchiseStoreLocationIds = franchiseStoreLocations.map(
    (sl: { id: string }) => sl.id
  );

  let stockLocationIds: string[] = [];
  if (franchiseStoreLocationIds.length) {
    const { data: stockLinks } = await query.graph({
      entity: StoreLocationStockLocationLink.entryPoint,
      fields: ["stock_location_id"],
      filters: { store_location_id: franchiseStoreLocationIds },
    });
    stockLocationIds = Array.from(
      new Set(
        (stockLinks as Array<{ stock_location_id?: string }>)
          .map((l) => l.stock_location_id)
          .filter((id): id is string => Boolean(id))
      )
    );
  }
  if (!stockLocationIds.length) {
    logger.warn(
      "No stock locations linked to this franchise's stores — imported " +
        "products will have inventory items but no stock levels until stores are wired up."
    );
  }

  // 4. Crawl Sitemap for Product URLs
  let productUrls: string[] = [];
  try {
    logger.info(`Fetching sitemap: ${SITEMAP_URL}`);
    const response = await axios.get(SITEMAP_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    const $ = cheerio.load(response.data, { xmlMode: true });
    
    $("loc").each((_, el) => {
      const url = $(el).text().trim();
      if (!url.startsWith(BASE_URL)) return;

      const path = url.substring(BASE_URL.length);
      if (path === "/" || path === "") return;

      const isIgnored = IGNORED_PATHS.some((ignored) => path.includes(ignored));
      if (!isIgnored) {
        productUrls.push(url);
      }
    });

    logger.info(`Discovered ${productUrls.length} potential product URLs.`);
  } catch (error: any) {
    logger.error(`Failed to crawl sitemap: ${error.message}`);
    return;
  }

  // Slice to limit
  const urlsToScrape = productUrls.slice(0, PRODUCT_LIMIT);
  logger.info(`Beginning scrape of ${urlsToScrape.length} products...`);

  // 5. Scrape each product page
  const scrapedProducts: ScrapedProduct[] = [];
  for (const url of urlsToScrape) {
    try {
      logger.info(`Scraping: ${url}`);
      const pageResponse = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      const $ = cheerio.load(pageResponse.data);

      const titleText = $(".page-title .base").text().trim();
      if (!titleText) {
        logger.warn(`Skipping ${url} - Page title not found.`);
        continue;
      }

      // Handle & SKU
      const handle = url.substring(url.lastIndexOf("/") + 1);
      const sku = $(".product.attribute.sku .value").text().trim() || `SKU-${handle.toUpperCase()}`;
      // Prefer the longest real product copy Magento exposes:
      // long description attribute → meta description → short overview.
      const overviewText = $(".product.attribute.overview .value")
        .text()
        .replace(/\s+/g, " ")
        .trim()
      const longDescText = (
        $(".product.attribute.description .value").text() ||
        $("#description .value").text() ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
      const metaDescText = (
        $('meta[name="description"]').attr("content") || ""
      ).trim()
      const candidates = [longDescText, metaDescText, overviewText]
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^allergens?\s*:/i.test(s))
      candidates.sort((a, b) => b.length - a.length)
      const description =
        candidates[0] || "Delicious cake break creation."

      // Base Price
      const rawPriceAmount = $("[data-price-type='finalPrice']").first().attr("data-price-amount");
      const basePrice = rawPriceAmount ? parseFloat(rawPriceAmount) : 15.0;

      // Extract Images
      const images: string[] = [];
      // Look inside script tag containing magento gallery data
      $("script[type='text/x-magento-init']").each((_, scriptEl) => {
        const text = $(scriptEl).text();
        if (text.includes("mage/gallery/gallery")) {
          try {
            const parsed = JSON.parse(text);
            const galleryConfig = Object.values(parsed).find((cfg: any) => cfg["mage/gallery/gallery"]) as any;
            const galleryData = galleryConfig?.["mage/gallery/gallery"]?.data || [];
            for (const imgItem of galleryData) {
              if (imgItem.full) {
                images.push(imgItem.full);
              }
            }
          } catch (e) {
            // parsing error, ignore
          }
        }
      });

      // Fallback main image
      if (images.length === 0) {
        const mainPlaceholderImg = $(".gallery-placeholder__image").first().attr("data-src");
        if (mainPlaceholderImg) images.push(mainPlaceholderImg);
      }

      // Parse Options (Size, Sponge)
      const options: ScrapedProduct["options"] = [];
      const parsedOptionNames = new Set<string>();
      $(".product-options-wrapper select").each((_, selectEl) => {
        const select = $(selectEl);
        let name = select.closest(".field").find(".label span").text().trim();
        if (!name || name.toLowerCase().includes("date") || name.toLowerCase().includes("time")) return;

        let uniqueName = name;
        let count = 1;
        while (parsedOptionNames.has(uniqueName)) {
          count++;
          uniqueName = `${name} ${count}`;
        }
        parsedOptionNames.add(uniqueName);
        const optionTitle = uniqueName;

        const values: string[] = [];
        const priceAdjustments: Record<string, number> = {};

        select.find("option").each((_, optEl) => {
          const opt = $(optEl);
          const val = opt.text().trim();
          if (!val || val.toLowerCase().includes("please select")) return;

          values.push(val);
          const priceAttr = opt.attr("price");
          priceAdjustments[val] = priceAttr ? parseFloat(priceAttr) : 0;
        });

        if (values.length > 0) {
          options.push({ title: optionTitle, values, priceAdjustments });
        }
      });

      scrapedProducts.push({
        title: titleText,
        handle,
        sku,
        description,
        basePrice,
        images,
        options,
      });

      logger.info(`Successfully scraped product: ${titleText} (Base Price: £${basePrice}, Variants parsed: ${options.length})`);
    } catch (scrapeErr: any) {
      logger.error(`Error scraping ${url}: ${scrapeErr.message}`);
    }
  }

  // 6. Ingest into Medusa v2 DB
  logger.info(`Ingesting ${scrapedProducts.length} scraped products into Medusa...`);
  let ingestedCount = 0;

  for (const item of scrapedProducts) {
    try {
      // Map options
      const productOptions = item.options.map((opt) => ({
        title: opt.title,
        values: opt.values,
      }));

      // Generate Variants (Cartesian product of Size & Sponge options if they exist)
      const variants: any[] = [];
      const optionsList = item.options;

      if (optionsList.length === 0) {
        // Simple product
        variants.push({
          title: "Standard",
          sku: item.sku,
          prices: [{ amount: item.basePrice, currency_code: "gbp" }],
        });
      } else if (optionsList.length === 1) {
        const opt = optionsList[0];
        for (const val of opt.values) {
          const adj = opt.priceAdjustments[val] || 0;
          const finalPrice = item.basePrice + adj;
          variants.push({
            title: val,
            sku: `${item.sku}-${val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
            options: { [opt.title]: val },
            prices: [{ amount: finalPrice, currency_code: "gbp" }],
          });
        }
      } else {
        // Multi-option combinations (usually Size and Sponge)
        const opt1 = optionsList[0];
        const opt2 = optionsList[1];

        // For options beyond index 1, populate with the first available value as default
        const extraOptions: Record<string, string> = {};
        for (let i = 2; i < optionsList.length; i++) {
          extraOptions[optionsList[i].title] = optionsList[i].values[0];
        }

        for (const val1 of opt1.values) {
          const adj1 = opt1.priceAdjustments[val1] || 0;
          for (const val2 of opt2.values) {
            const adj2 = opt2.priceAdjustments[val2] || 0;
            const finalPrice = item.basePrice + adj1 + adj2;

            variants.push({
              title: `${val1} / ${val2}`,
              sku: `${item.sku}-${val1.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3)}-${val2.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3)}`.toUpperCase(),
              options: {
                [opt1.title]: val1,
                [opt2.title]: val2,
                ...extraOptions,
              },
              prices: [{ amount: finalPrice, currency_code: "gbp" }],
            });
          }
        }
      }

      // If the product already exists (e.g. imported by an earlier run of this
      // script before it persisted prices), don't blindly skip — backfill any
      // variants that are still missing a price set from the freshly-scraped
      // prices, matched by SKU (title as a fallback). This keeps the script
      // idempotent and repairs previously-imported "Price unavailable" products
      // in place, without touching their images, inventory, or links.
      const [existing] = await productService.listProducts({ handle: item.handle });
      if (existing) {
        const { data: existingVariants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "sku", "title", "price_set.id"],
          filters: { product_id: existing.id },
        });

        const pricesBySku = new Map<string, any[]>();
        const pricesByTitle = new Map<string, any[]>();
        for (const v of variants) {
          if (v.sku) pricesBySku.set(v.sku, v.prices);
          if (v.title) pricesByTitle.set(v.title, v.prices);
        }

        type ExistingVariant = {
          id: string;
          sku?: string | null;
          title?: string | null;
          price_set?: { id?: string } | null;
        };

        const backfillLinks: Array<{
          [Modules.PRODUCT]: { variant_id: string };
          [Modules.PRICING]: { price_set_id: string };
        }> = [];

        for (const ev of existingVariants as ExistingVariant[]) {
          if (ev.price_set?.id) continue; // already priced
          const prices =
            (ev.sku ? pricesBySku.get(ev.sku) : undefined) ??
            (ev.title ? pricesByTitle.get(ev.title) : undefined);
          if (!prices?.length) {
            logger.warn(
              `  No scraped price matched existing variant "${ev.title ?? ev.sku ?? ev.id}" — skipped.`
            );
            continue;
          }

          const priceSet = await pricingService.createPriceSets({ prices });
          backfillLinks.push({
            [Modules.PRODUCT]: { variant_id: ev.id },
            [Modules.PRICING]: { price_set_id: priceSet.id },
          });
        }

        if (backfillLinks.length) {
          await remoteLink.create(backfillLinks);
          logger.info(
            `Product already exists: ${item.title}. Backfilled ${backfillLinks.length} missing price(s).`
          );
          ingestedCount++;
        } else {
          logger.info(
            `Product already exists: ${item.title}. All variants already priced — skipping.`
          );
        }
        continue;
      }

      // Create Product
      logger.info(`Creating product: ${item.title}...`);
      // Magento product pages do not publish per-product ingredient/allergen
      // lists. Dietary claims (Eggless / Vegan / …) are backfilled by
      // one-off/scrape-live-ingredients-allergens.ts after import.
      const product = await productService.createProducts({
        title: item.title,
        handle: item.handle,
        description: item.description,
        images: item.images.map((url) => ({ url })),
        options: productOptions,
        variants: variants,
        status: "published" as any,
        metadata: {
          supports_inscription: "true",
          supports_photo_upload: /photo/i.test(item.title) ? "true" : "false",
        },
      });

      // Create a price set for every variant and link it via the pricing
      // module. Like inventory, createProducts() (the raw module service)
      // accepts an inline `prices` array for convenience but never actually
      // persists it into the pricing module — that wiring normally only
      // happens inside createProductVariantsWorkflow. Without this, every
      // imported variant resolves to calculated_price: null and can't be
      // added to a cart ("Variant does not have a price").
      const createdVariants = product.variants ?? [];
      const priceSetLinks: Array<{
        [Modules.PRODUCT]: { variant_id: string };
        [Modules.PRICING]: { price_set_id: string };
      }> = [];
      for (let i = 0; i < createdVariants.length; i++) {
        const sourcePrices = variants[i]?.prices;
        if (!sourcePrices?.length) continue;

        const priceSet = await pricingService.createPriceSets({
          prices: sourcePrices,
        });

        priceSetLinks.push({
          [Modules.PRODUCT]: { variant_id: createdVariants[i].id },
          [Modules.PRICING]: { price_set_id: priceSet.id },
        });
      }
      if (priceSetLinks.length) {
        await remoteLink.create(priceSetLinks);
      }

      // Link to sales channel
      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
      });

      // Link to franchise
      await remoteLink.create({
        franchise: { franchise_id: franchise.id },
        [Modules.PRODUCT]: { product_id: product.id },
      });

      // Create inventory items for every managed-inventory variant and stock
      // them at IMPORT_STOCK_QTY across every one of the franchise's stock
      // locations. Without this, createProducts() (the raw module service)
      // never creates inventory items — that normally only happens inside
      // createProductVariantsWorkflow — so imported variants would resolve
      // to `inventory_quantity: null` and show as permanently unavailable.
      const managedVariants = (product.variants ?? []).filter(
        (v: { manage_inventory?: boolean }) => v.manage_inventory !== false
      );

      if (managedVariants.length && stockLocationIds.length) {
        const createdItems = await inventoryService.createInventoryItems(
          managedVariants.map((v: { sku?: string | null; title?: string | null }) => ({
            sku: v.sku ?? undefined,
            title: v.title ?? undefined,
          }))
        );

        const variantInventoryLinks = managedVariants.map(
          (v: { id: string }, index: number) => ({
            [Modules.PRODUCT]: { variant_id: v.id },
            [Modules.INVENTORY]: { inventory_item_id: createdItems[index].id },
            data: { required_quantity: 1 },
          })
        );
        await remoteLink.create(variantInventoryLinks);

        const levelsToCreate = createdItems.flatMap((invItem) =>
          stockLocationIds.map((stockLocationId) => ({
            inventory_item_id: invItem.id,
            location_id: stockLocationId,
            stocked_quantity: IMPORT_STOCK_QTY,
          }))
        );
        await inventoryService.createInventoryLevels(levelsToCreate);
      }

      // Assign default shipping profile to prevent checkout validation errors
      if (defaultProfileId) {
        await pgConnection.raw(`
          INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
          VALUES (gen_random_uuid()::text, ?, ?)
          ON CONFLICT DO NOTHING
        `, [product.id, defaultProfileId]);
      }

      ingestedCount++;
      logger.info(`Successfully ingested product: ${item.title}`);
    } catch (ingestErr: any) {
      logger.error(`Failed to ingest product ${item.title}: ${ingestErr.message}`);
    }
  }

  logger.info(`Finished ingestion. Ingested ${ingestedCount} products.`);
}
