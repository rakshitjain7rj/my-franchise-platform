import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import axios from "axios";
import * as cheerio from "cheerio";
import StoreLocationStockLocationLink from "../links/store-location-stock-location";

// Starting stock quantity seeded at every franchise stock location for imported variants.
const IMPORT_STOCK_QTY = process.env.IMPORT_STOCK_QTY ? parseInt(process.env.IMPORT_STOCK_QTY, 10) : 50;

const TARGET_URLS = [
  "https://eggfreecakebreak.com/um-butter-cream",
  "https://eggfreecakebreak.com/uhm2-fruit-cake",
  "https://eggfreecakebreak.com/uhm3-ferrero-rocher"
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

export default async function importSpecificUrls({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const remoteLink = container.resolve("remoteLink");
  const pgConnection = container.resolve("__pg_connection__");

  const productService = container.resolve(Modules.PRODUCT);
  const inventoryService = container.resolve(Modules.INVENTORY);
  const pricingService = container.resolve(Modules.PRICING);
  const franchiseService = container.resolve("franchise");

  logger.info("Starting targeted live catalog ingestion...");

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

  // 3b. Resolve store locations
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

  // Scrape targeted URLs
  const scrapedProducts: ScrapedProduct[] = [];
  for (const url of TARGET_URLS) {
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
            // parsing error, ignore
          }
        }
      });

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
      const productOptions = item.options.map((opt) => ({
        title: opt.title,
        values: opt.values,
      }));

      const variants: any[] = [];
      const optionsList = item.options;

      if (optionsList.length === 0) {
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
        const opt1 = optionsList[0];
        const opt2 = optionsList[1];

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
          if (ev.price_set?.id) continue;
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

      logger.info(`Creating product: ${item.title}...`);
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

      await remoteLink.create({
        [Modules.PRODUCT]: { product_id: product.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
      });

      await remoteLink.create({
        franchise: { franchise_id: franchise.id },
        [Modules.PRODUCT]: { product_id: product.id },
      });

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
