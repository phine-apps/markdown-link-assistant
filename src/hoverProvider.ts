/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getMetadataForUrl } from "./metadataService";
import { getExistingLinkRange, escapeHtml } from "./utils";

export class MarkdownLinkAssistantHoverProvider implements vscode.HoverProvider {
  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    // 1. Check for existing link/card first (covers markdown links and card blocks)
    const existingLink = getExistingLinkRange(document, position);
    if (existingLink) {
      return this.createHover(
        document,
        existingLink.url,
        existingLink.range,
        existingLink.fullRange,
      );
    }

    // 2. Check for raw URLs (that are not already part of a link/card)
    const line = document.lineAt(position.line).text;
    const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
    let match;
    while ((match = urlRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (position.character >= start && position.character <= end) {
        return this.createHover(
          document,
          match[0],
          new vscode.Range(position.line, start, position.line, end),
        );
      }
    }

    return undefined;
  }

  private async createHover(
    _document: vscode.TextDocument,
    url: string,
    displayRange: vscode.Range,
    actionRange?: vscode.Range,
  ): Promise<vscode.Hover> {
    const metadata = await getMetadataForUrl(url);
    const commandRange = actionRange || displayRange;

    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.isTrusted = true;
    markdown.supportThemeIcons = true;

    if (metadata.image) {
      markdown.appendMarkdown(
        `<img src="${metadata.image}" height="100" style="border-radius: 4px; margin-bottom: 8px;" />\n\n`,
      );
    }

    markdown.appendMarkdown(`### ${escapeHtml(metadata.title)}\n`);

    const summary = metadata.description || "";
    if (summary) {
      markdown.appendMarkdown(`${escapeHtml(summary)}\n\n`);
    }

    const unfurlLabel = actionRange
      ? vscode.l10n.t("Refresh Info")
      : vscode.l10n.t("Unfurl Link");

    const unfurlCommand = vscode.Uri.parse(
      `command:markdown-link-assistant.unfurlAtCursor?${encodeURIComponent(
        JSON.stringify([url, commandRange]),
      )}`,
    );
    const previewCommand = vscode.Uri.parse(
      `command:markdown-link-assistant.openLivePreview?${encodeURIComponent(
        JSON.stringify([url]),
      )}`,
    );

    markdown.appendMarkdown(
      `[${unfurlLabel}](${unfurlCommand}) &nbsp; | &nbsp; ` +
      `[$(eye) ${vscode.l10n.t("Live Preview")}](${previewCommand})`
    );

    // Use a zero-width range to suppress VS Code's native "Follow link" hover part
    const hoverRange = new vscode.Range(displayRange.start, displayRange.start);
    return new vscode.Hover(markdown, hoverRange);
  }
}
