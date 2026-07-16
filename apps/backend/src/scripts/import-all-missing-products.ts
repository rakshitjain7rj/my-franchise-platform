import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import axios from "axios";
import * as cheerio from "cheerio";
import StoreLocationStockLocationLink from "../links/store-location-stock-location";

const IMPORT_STOCK_QTY = process.env.IMPORT_STOCK_QTY ? parseInt(process.env.IMPORT_STOCK_QTY, 10) : 50;

const CATEGORIES = [
  'https://eggfreecakebreak.com/cakes/christmas-cakes-cupcakes',
  'https://eggfreecakebreak.com/cakes/round-cakes',
  'https://eggfreecakebreak.com/cakes/square-cakes',
  'https://eggfreecakebreak.com/cakes/novelty-kids-cakes',
  'https://eggfreecakebreak.com/cakes/doll-cakes',
  'https://eggfreecakebreak.com/cakes/number-cakes',
  'https://eggfreecakebreak.com/cakes/icing-cakes',
  'https://eggfreecakebreak.com/cakes/wedding-cakes',
  'https://eggfreecakebreak.com/cakes/baby-shower-cakes',
  'https://eggfreecakebreak.com/cakes/tiered-cakes',
  'https://eggfreecakebreak.com/cakes/tray-cakes',
  'https://eggfreecakebreak.com/cakes/heart-cake',
  'https://eggfreecakebreak.com/cakes/vegan-cakes-dairy-free',
  'https://eggfreecakebreak.com/cakes/cupcakes-slices-and-extras',
  'https://eggfreecakebreak.com/cakes/valentines-day-cakes',
  'https://eggfreecakebreak.com/cakes/giant-cookies',
  'https://eggfreecakebreak.com/cakes/chocolate-bouquets',
  'https://eggfreecakebreak.com/cakes/tall-cakes',
  'https://eggfreecakebreak.com/cakes/photo-cake',
  'https://eggfreecakebreak.com/cakes/click-and-collect',
  'https://eggfreecakebreak.com/cakes/umrah-and-hajj-mubarak-cake',
  'https://eggfreecakebreak.com/cakes/double-tall-cakes',
  'https://eggfreecakebreak.com/cakes/graduation-cakes',
  'https://eggfreecakebreak.com/cakes/diwali-cakes',
  'https://eggfreecakebreak.com/cakes/easter',
  'https://eggfreecakebreak.com/cakes/fathers-day-cakes',
  'https://eggfreecakebreak.com/cakes/lohri-cakes',
  'https://eggfreecakebreak.com/cakes/valentines',
  'https://eggfreecakebreak.com/cakes/vaisakhi-cakes',
  'https://eggfreecakebreak.com/cakes/eid-cakes',
  'https://eggfreecakebreak.com/cakes/mothers-day-cakes',
  'https://eggfreecakebreak.com/cakes/raksha-bandhan'
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

export default async function importAllMissingProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const pgConnection = container.resolve("__pg_connection__");

  const productService = container.resolve(Modules.PRODUCT);
  const inventoryService = container.resolve(Modules.INVENTORY);
  const pricingService = container.resolve(Modules.PRICING);
  const franchiseService = container.resolve("franchise");

  logger.info("========================================");
  logger.info("  Starting Comprehensive Live Catalog Crawl");
  logger.info("========================================");

  // 1. Get Franchise
  const existingFranchises = await franchiseService.listFranchises();
  const franchise = existingFranchises[0];
  if (!franchise) {
    logger.error("No franchise found. Run franchise seed first.");
    return;
  }
  logger.info(`Franchise ID: ${franchise.id}`);

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

  // 3b. Resolve store and stock locations
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

  // 4. Load all existing products from database
  const { data: dbProducts } = await query.graph({
    entity: "product",
    fields: ["handle"]
  });
  const existingHandles = new Set(dbProducts.map((p: any) => p.handle.toLowerCase()));
  logger.info(`Loaded ${existingHandles.size} existing products from database.`);

  // 5. Crawl all categories to find product URLs
  const scrapedUrls = new Set<string>();

  for (const catUrl of CATEGORIES) {
    logger.info(`Crawling category: ${catUrl}...`);
    let currentUrl: string | undefined = catUrl;
    let pageCount = 0;

    while (currentUrl && pageCount < 30) {
      try {
        const response = await axios.get(currentUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          timeout: 15_000
        });
        const $ = cheerio.load(response.data);
        pageCount++;

        $(".product-item-info a.product-item-photo").each((_, el) => {
          const href = $(el).attr("href");
          if (href) scrapedUrls.add(href.trim());
        });

        const nextLink = $("a.action.next").first().attr("href");
        currentUrl = nextLink ? nextLink.trim() : undefined;
      } catch (err: any) {
        logger.error(`Error crawling category page ${currentUrl}: ${err.message}`);
        currentUrl = undefined;
      }
    }
  }

  logger.info(`Found ${scrapedUrls.size} unique product URLs on client site.`);

  // Filter missing URLs
  const missingUrls: string[] = [];
  for (const url of scrapedUrls) {
    const handle = url.substring(url.lastIndexOf("/") + 1).toLowerCase();
    if (!existingHandles.has(handle)) {
      missingUrls.push(url);
    }
  }

  logger.info(`Number of missing products to ingest: ${missingUrls.length}`);
  if (missingUrls.length === 0) {
    logger.info("All products are already in the database. Ingestion completed.");
    return;
  }

  // 6. Ingest missing products
  let ingestedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < missingUrls.length; i++) {
    const url = missingUrls[i];
    logger.info(`\n[${i + 1}/${missingUrls.length}] Scraping: ${url}`);
    
    try {
      const pageResponse = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 15_000
      });
      const $ = cheerio.load(pageResponse.data);

      const titleText = $(".page-title .base").text().trim();
      if (!titleText) {
        logger.warn(`Skipping ${url} - Page title not found.`);
        errorCount++;
        continue;
      }

      // Handle & SKU
      const handle = url.substring(url.lastIndexOf("/") + 1);
      const sku = $(".product.attribute.sku .value").text().trim() || `SKU-${handle.toUpperCase()}`;
      const overviewText = $(".product.attribute.overview .value")
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const longDescText = (
        $(".product.attribute.description .value").text() ||
        $("#description .value").text() ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      const metaDescText = (
        $('meta[name="description"]').attr("content") || ""
      ).trim();
      const candidates = [longDescText, metaDescText, overviewText]
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^allergens?\s*:/i.test(s));
      candidates.sort((a, b) => b.length - a.length);
      const description = candidates[0] || "Delicious cake break creation.";

      // Base Price
      const rawPriceAmount = $("[data-price-type='finalPrice']").first().attr("data-price-amount");
      const basePrice = rawPriceAmount ? parseFloat(rawPriceAmount) : 15.0;

      // Extract Images
      const images: string[] = [];
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
            // ignore JSON parse error
          }
        }
      });

      if (images.length === 0) {
        const mainPlaceholderImg = $(".gallery-placeholder__image").first().attr("data-src");
        if (mainPlaceholderImg) images.push(mainPlaceholderImg);
      }

      // Parse Options
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

      // Map options
      const productOptions = options.map((opt) => ({
        title: opt.title,
        values: opt.values,
      }));

      // Generate Variants
      const variants: any[] = [];
      const optionsList = options;

      if (optionsList.length === 0) {
        variants.push({
          title: "Standard",
          sku: sku,
          prices: [{ amount: basePrice, currency_code: "gbp" }],
        });
      } else if (optionsList.length === 1) {
        const opt = optionsList[0];
        for (const val of opt.values) {
          const adj = opt.priceAdjustments[val] || 0;
          const finalPrice = basePrice + adj;
          variants.push({
            title: val,
            sku: `${sku}-${val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
            options: { [opt.title]: val },
            prices: [{ amount: finalPrice, currency_code: "gbp" }],
          });
        }
      } else {
        const opt1 = optionsList[0];
        const opt2 = optionsList[1];

        const extraOptions: Record<string, string> = {};
        for (let j = 2; j < optionsList.length; j++) {
          extraOptions[optionsList[j].title] = optionsList[j].values[0];
        }

        for (const val1 of opt1.values) {
          const adj1 = opt1.priceAdjustments[val1] || 0;
          for (const val2 of opt2.values) {
            const adj2 = opt2.priceAdjustments[val2] || 0;
            const finalPrice = basePrice + adj1 + adj2;

            variants.push({
              title: `${val1} / ${val2}`,
              sku: `${sku}-${val1.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3)}-${val2.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3)}`.toUpperCase(),
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

      // Check if product exists already (sanity check)
      const [existing] = await productService.listProducts({ handle: handle });
      if (existing) {
        logger.info(`Product already exists: ${titleText}. Skipping.`);
        continue;
      }

      // Create Product
      const product = await productService.createProducts({
        title: titleText,
        handle: handle,
        description: description,
        images: images.map((url) => ({ url })),
        options: productOptions,
        variants: variants,
        status: "published" as any,
        metadata: {
          supports_inscription: "true",
          supports_photo_upload: /photo/i.test(titleText) ? "true" : "false",
        },
      });

      // Price Sets link
      const createdVariants = product.variants ?? [];
      const priceSetLinks: Array<{
        [Modules.PRODUCT]: { variant_id: string };
        [Modules.PRICING]: { price_set_id: string };
      }> = [];
      for (let j = 0; j < createdVariants.length; j++) {
        const sourcePrices = variants[j]?.prices;
        if (!sourcePrices?.length) continue;

        const priceSet = await pricingService.createPriceSets({
          prices: sourcePrices,
        });

        priceSetLinks.push({
          [Modules.PRODUCT]: { variant_id: createdVariants[j].id },
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

      // Inventory Levels
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

      // Shipping Profile Link
      if (defaultProfileId) {
        await pgConnection.raw(`
          INSERT INTO product_shipping_profile (id, product_id, shipping_profile_id)
          VALUES (gen_random_uuid()::text, ?, ?)
          ON CONFLICT DO NOTHING
        `, [product.id, defaultProfileId]);
      }

      ingestedCount++;
      logger.info(`Ingested product successfully: ${titleText}`);
    } catch (ingestErr: any) {
      errorCount++;
      logger.error(`Failed to ingest product ${url}: ${ingestErr.message}`);
    }

    // Polite delay to prevent rate limit
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  logger.info("========================================");
  logger.info(`Ingestion finished. Ingested: ${ingestedCount}, Errors: ${errorCount}`);
  logger.info("========================================");
}
