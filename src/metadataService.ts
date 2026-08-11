/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as cheerio from "cheerio";
import { getDispatcher } from "./proxy";

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  // Site-specific
  youtube?: { channelName: string; duration: string; publishDate: string };
  github?: { stars: string; description: string; lastUpdate: string };
}

const metadataCache = new Map<string, LinkMetadata>();
const MAX_CACHE_SIZE = 100;

function addToCache(url: string, metadata: LinkMetadata) {
  if (metadataCache.size >= MAX_CACHE_SIZE) {
    const firstKey = metadataCache.keys().next().value;
    if (firstKey !== undefined) {
      metadataCache.delete(firstKey);
    }
  }
  metadataCache.set(url, metadata);
}

export async function getMetadataForUrl(url: string): Promise<LinkMetadata> {
  const cached = metadataCache.get(url);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: getDispatcher() as any,
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Referer": "https://www.google.com/",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { url, title: url };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return { url, title: url };
    }

    // Detect encoding from content-type header
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    let encoding = charsetMatch ? charsetMatch[1].trim() : "";

    // Limit to 1MB
    const MAX_BYTES = 1024 * 1024;
    let html = "";
    const reader = response.body?.getReader();
    if (!reader) {
      return { url, title: url };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          totalBytes += value.length;
          chunks.push(value);
          
          if (!encoding && totalBytes > 0) {
            const peek = Buffer.from(chunks[0]).toString("ascii", 0, 1024);
            const metaMatch = peek.match(/<meta\s+charset=["']?([^"' />]+)/i) || 
                              peek.match(/<meta\s+http-equiv=["']?content-type["']?\s+content=["']?[^"'>]*charset=([^"' />]+)/i);
            if (metaMatch) {
              encoding = metaMatch[1].trim();
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }

    if (!encoding) {
      encoding = "utf-8";
    }

    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(encoding);
    } catch {
      decoder = new TextDecoder("utf-8");
    }

    const completeBuffer = Buffer.concat(chunks);
    html = decoder.decode(completeBuffer);
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").first().text().trim() ||
      url;
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      $('meta[name="description"]').attr("content");
    const image = 
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");
    const siteName = 
      $('meta[property="og:site_name"]').attr("content") ||
      $('meta[name="twitter:site"]').attr("content");

    const metadata: LinkMetadata = { url, title, description, image, siteName };

    // Simple site-specific logic (heuristic)
    let hostname = "";
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      // Ignore URL parsing errors
    }

    const isYouTube =
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be" ||
      hostname.endsWith(".youtu.be");

    const isGitHub =
      hostname === "github.com" ||
      hostname.endsWith(".github.com");

    if (isYouTube) {
      metadata.youtube = {
        channelName:
          $('link[itemprop="name"]').attr("content") || 
          $('span[itemprop="author"] link[itemprop="name"]').attr("content") ||
          "Unknown Channel",
        duration: $('meta[itemprop="duration"]').attr("content") || "Unknown",
        publishDate:
          $('meta[itemprop="datePublished"]').attr("content") || 
          $('meta[name="uploadDate"]').attr("content") ||
          "Unknown Date",
      };
    } else if (isGitHub) {
      const repoDesc = $('meta[name="description"]').attr("content") || 
                       $('meta[property="og:description"]').attr("content") || "";
      
      const stars =
        $('a[href$="/stargazers"] .Counter').first().text().trim() ||
        $('span#repo-stars-counter-star').text().trim() || 
        "Unknown";
      
      const lastUpdate =
        $("relative-time").attr("datetime") || 
        $('meta[property="og:updated_time"]').attr("content") ||
        "Unknown Update";

      metadata.github = {
        stars,
        description: repoDesc,
        lastUpdate,
      };
    }

    addToCache(url, metadata);
    return metadata;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      console.warn("Metadata fetch timed out for:", url);
    } else {
      console.error("Failed to fetch metadata:", e);
    }
    return { url, title: url };
  } finally {
    clearTimeout(timeoutId);
  }
}
