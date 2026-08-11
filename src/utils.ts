/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { LinkMetadata } from "./metadataService";

export function escapeHtml(unsafe: string): string {
  if (!unsafe) {
    return "";
  }
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatInline(
  url: string,
  metadata: LinkMetadata,
  summary?: string,
): string {
  const safeTitle = (metadata.title || url)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  const safeSummary = summary ? summary.replace(/--/g, "- -") : "";
  const summaryText = safeSummary ? ` <!-- ${safeSummary} -->` : "";
  return `[${safeTitle}](${url})${summaryText}`;
}

export function formatTitleOnly(url: string, metadata: LinkMetadata): string {
  const safeTitle = (metadata.title || url)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  return `[${safeTitle}](${url})`;
}

export function formatYouTubeDuration(duration: string): string {
  if (!duration || !duration.startsWith("PT")) {
    return duration;
  }
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return duration;
  }
  
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

export function formatCard(
  url: string,
  metadata: LinkMetadata,
  summary?: string,
): string {
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(metadata.title || url);
  const safeImage = metadata.image ? escapeHtml(metadata.image) : "";
  const safeDesc = escapeHtml(summary || metadata.description || "");

  const imageTag = safeImage
    ? `<img src="${safeImage}" style="max-width: 120px; max-height: 120px; object-fit: contain; margin-left: 15px; border-radius: 4px;" />`
    : "";

  let extraTags = "";
  if (metadata.github) {
    extraTags = `⭐ ${escapeHtml(metadata.github.stars)} | 📅 Updated: ${escapeHtml(metadata.github.lastUpdate)}`;
  } else if (metadata.youtube) {
    extraTags = `📺 ${escapeHtml(metadata.youtube.channelName)} | ⏱ ${escapeHtml(formatYouTubeDuration(metadata.youtube.duration))}`;
  } else if (metadata.qiita) {
    extraTags = `👤 ${escapeHtml(metadata.qiita.author)} | ❤️ ${escapeHtml(metadata.qiita.likes)}`;
  } else if (metadata.zenn) {
    extraTags = `👤 ${escapeHtml(metadata.zenn.author)} | ❤️ ${escapeHtml(metadata.zenn.likes)}`;
  } else if (metadata.stackOverflow) {
    const accepted = metadata.stackOverflow.isAccepted ? " ✅" : "";
    extraTags = `⬆️ ${escapeHtml(metadata.stackOverflow.score)} | 💬 ${escapeHtml(metadata.stackOverflow.answers)}${accepted}`;
  }

  const siteInfo = metadata.siteName
    ? `<span style="font-size: 0.85em; opacity: 0.8;">${escapeHtml(metadata.siteName)}</span>`
    : "";
  const footer = extraTags
    ? `<div style="font-size: 0.8em; margin-top: 4px; opacity: 0.7;">${extraTags}</div>`
    : "";

  return `<div data-markdown-link-assistant-card="true" style="margin: 16px 0; border: 1px solid var(--vscode-widget-border); border-radius: 6px; overflow: hidden; font-family: sans-serif;">
<div style="display: flex; padding: 12px; align-items: flex-start; background: var(--vscode-editor-background);">
<div style="flex: 1; min-width: 0;">
<div style="font-weight: bold; font-size: 1.1em; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
<a href="${safeUrl}" style="text-decoration: none; color: var(--vscode-textLink-foreground);">${safeTitle}</a>
</div>
<div style="font-size: 0.9em; line-height: 1.4; color: var(--vscode-descriptionForeground); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
${safeDesc}
</div>
<div style="margin-top: 8px;">
${siteInfo}${footer}</div>
</div>
${imageTag}</div>
</div>`;
}

export function isValidUrl(url: string): boolean {
  const s = url.trim();
  if (s.includes(" ") || s.includes("\n")) {
    return false;
  }

  // Require explicit protocol for general URLs to prevent false positives 
  // on code snippets like `document.getElementById` or `file.txt`
  if (!/^https?:\/\//i.test(s)) {
    // Exception for localhost for local development
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/.test(s)) {
      return false;
    }
  }

  try {
    const urlToTest = /^https?:\/\//i.test(s) ? s : `http://${s}`;
    const parsed = new URL(urlToTest);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0 &&
      (parsed.hostname.includes(".") ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

import {
  getCachedValidationResult,
  ValidationStatus,
} from "./validationService";

/**
 * Checks if a URL points to an image.
 * Uses cached validation results (Content-Type) if available,
 * otherwise falls back to extension-based detection.
 */
export function isImageUrl(url: string): boolean {
  // 1. Check cached validation result for Content-Type (most accurate)
  const cached = getCachedValidationResult(url);
  if (
    cached?.status === ValidationStatus.ok &&
    cached.contentType?.startsWith("image/")
  ) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
      ".tiff",
      ".avif",
    ];

    // 2. Check extension in pathname
    if (imageExtensions.some((ext) => pathname.endsWith(ext))) {
      return true;
    }

    // 3. Heuristics for common image delivery patterns (for immediate UI response)
    // If it's on a subdomain starting with images. or img., OR has format/fm query params.
    const isImageSubdomain =
      hostname.startsWith("images.") ||
      hostname.startsWith("img.") ||
      hostname === "unsplash.com" ||
      hostname.endsWith(".unsplash.com") ||
      hostname === "imgix.net" ||
      hostname.endsWith(".imgix.net");

    const hasImageFormatQuery =
      parsed.searchParams.has("format") || parsed.searchParams.has("fm");

    if (isImageSubdomain || hasImageFormatQuery) {
      return true;
    }

    return false;
  } catch {
    // Fallback to simple string check if URL parsing fails
    const lowercaseUrl = url.toLowerCase().split("?")[0].split("#")[0];
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
      ".tiff",
      ".avif",
    ];
    return imageExtensions.some((ext) => lowercaseUrl.endsWith(ext));
  }
}

/**
 * Ensures that a range object is a proper vscode.Range instance.
 */
export function ensureRange(range: unknown): vscode.Range {
  if (range instanceof vscode.Range) {
    return range;
  }
  if (!range || typeof range !== "object") {
    return new vscode.Range(0, 0, 0, 0);
  }

  if (Array.isArray(range) && range.length >= 2) {
    const start = range[0] as { line?: number; character?: number };
    const end = range[1] as { line?: number; character?: number };
    return new vscode.Range(
      start.line ?? 0,
      start.character ?? 0,
      end.line ?? 0,
      end.character ?? 0,
    );
  }

  const obj = range as {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
  if (obj.start && obj.end) {
    return new vscode.Range(
      obj.start.line ?? 0,
      obj.start.character ?? 0,
      obj.end.line ?? 0,
      obj.end.character ?? 0,
    );
  }
  return new vscode.Range(0, 0, 0, 0);
}

/**
 * Checks if a URL at a given position is already part of a markdown link or card.
 */
export function isAlreadyUnfurled(
  document: vscode.TextDocument,
  position: vscode.Position,
): boolean {
  const existing = getExistingLinkRange(document, position);
  if (existing) {
    return true;
  }

  const line = document.lineAt(position.line).text;
  const charBefore = position.character > 0 ? line[position.character - 1] : "";

  // If it's immediately preceded by ( or [, it's likely part of a link [text](url) or [url]
  if (charBefore === "(" || charBefore === "[") {
    return true;
  }

  return false;
}

/**
 * Gets the full range of a markdown link or card if the position is inside one.
 */
export function getExistingLinkRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): { url: string; range: vscode.Range; fullRange?: vscode.Range; isImage: boolean } | undefined {
  const lineText = document.lineAt(position.line).text;

  // 1. Match Markdown Link: ([text](url))( <!-- optional summary -->)
  // Handles escaped brackets in title: [\[Title\]](url)
  const mdRegex =
    /(!?\[(?:(?:[^\\\]]|\\.)+)\]\((https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*)\))( <!-- .*? -->)?/g;
  let match;
  while ((match = mdRegex.exec(lineText)) !== null) {
    const linkMatch = match[1];
    const fullMatch = match[0];
    const url = match[2];
    const start = match.index;
    const end = start + fullMatch.length;

    if (position.character >= start && position.character <= end) {
      return {
        url,
        range: new vscode.Range(position.line, start, position.line, end),
        fullRange: new vscode.Range(position.line, start, position.line, end),
        isImage: linkMatch.startsWith("!"),
      };
    }
  }

  // 2. Match Card (HTML)
  const cardBlock = getSurroundingBlockRange(document, position);
  if (cardBlock) {
    for (let l = cardBlock.start.line; l <= cardBlock.end.line; l++) {
      const line = document.lineAt(l).text;
      const cardUrlMatch = /<a href="(https?:\/\/[^"]+)"/.exec(line);
      if (cardUrlMatch) {
        return {
          url: cardUrlMatch[1],
          range: cardBlock,
          fullRange: cardBlock,
          isImage: false, // Cards are treated as links for Alt Text purposes
        };
      }
    }
  }

  // 3. Fallback: Standalone <a> tag
  const standaloneUrlMatch = /<a href="(https?:\/\/[^"]+)"/.exec(lineText);
  if (standaloneUrlMatch) {
    const url = standaloneUrlMatch[1];
    const start = standaloneUrlMatch.index;
    const closeTagIndex = lineText.indexOf("</a>", start);
    if (closeTagIndex !== -1) {
      const end = closeTagIndex + 4;
      if (position.character >= start && position.character <= end) {
        return {
          url,
          range: new vscode.Range(position.line, start, position.line, end),
          fullRange: new vscode.Range(position.line, start, position.line, end),
          isImage: false,
        };
      }
    }
  }

  return undefined;
}

function getSurroundingBlockRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Range | undefined {
  let startLine = position.line;
  let foundStart = false;

  // Search upwards for the card start tag
  // But don't look too far up (max 30 lines)
  while (startLine >= 0 && startLine >= position.line - 30) {
    const text = document.lineAt(startLine).text;
    if (text.includes('data-markdown-link-assistant-card="true"')) {
      foundStart = true;
      break;
    }
    startLine--;
  }

  if (!foundStart) {
    return undefined;
  }

  // Find the matching end tag for this card
  let divCount = 0;
  let endLine = -1;

  for (let i = startLine; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const opens = (lineText.match(/<div/g) || []).length;
    const closes = (lineText.match(/<\/div>/g) || []).length;

    divCount += opens - closes;

    if (divCount <= 0) {
      endLine = i;
      break;
    }

    if (i > startLine + 30) {
      break;
    }
  }

  if (endLine === -1 || position.line > endLine) {
    // Position is outside this card's boundaries
    return undefined;
  }

  return new vscode.Range(
    startLine,
    0,
    endLine,
    document.lineAt(endLine).text.length,
  );
}
