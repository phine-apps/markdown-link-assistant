/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getMetadataForUrl } from "./metadataService";

export async function generateReferencesSection(document: vscode.TextDocument) {
  const text = document.getText();
  // Match both [text](url) and raw https?://urls
  const linkRegex =
    /\[([^\]]+)\]\((https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*)\)|(https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*)/g;

  const links = new Map<string, string>(); // url -> text (first seen)

  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const isMarkdownLink = match[1] !== undefined;
    const url = isMarkdownLink ? match[2] : match[3];
    const linkText = isMarkdownLink ? match[1] : url;

    if (!url) {
      continue;
    }

    // avoid matching image links by checking if the previous char is '!'
    const isImage = match.index > 0 && text[match.index - 1] === "!";
    if (!isImage && !links.has(url)) {
      links.set(url, linkText);
    }
  }

  if (links.size === 0) {
    vscode.window.showInformationMessage(
      vscode.l10n.t("No links found in the document."),
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("Generating References..."),
      cancellable: false,
    },
    async () => {
      const referencesTitle = vscode.l10n.t("References");
      let referencesMarkdown = `\n\n## ${referencesTitle}\n\n`;

      const metadataResults = await Promise.all(
        Array.from(links.entries()).map(async ([url, linkText]) => {
          const metadata = await getMetadataForUrl(url);
          return { url, linkText, metadata };
        }),
      );

      for (const { url, linkText, metadata } of metadataResults) {
        const title = metadata.title || linkText;
        const siteName = metadata.siteName ? `${metadata.siteName}. ` : "";
        const today = new Date().toLocaleDateString();

        const isUrlTitle =
          title.startsWith("http://") ||
          title.startsWith("https://") ||
          title === url;
        const citation = vscode.l10n.t("Retrieved {0}, from {1}", today, url);

        if (isUrlTitle) {
          // If title is URL, omit the leading title to avoid redundancy and broken links
          referencesMarkdown += `- ${siteName}${citation}\n`;
        } else {
          referencesMarkdown += `- ${title}. ${siteName}${citation}\n`;
        }
      }

      // Check if ## References already exists
      const referencesHeader = `## ${referencesTitle}`;
      const lines = text.split("\n");
      let headerLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === referencesHeader) {
          headerLineIndex = i;
          break;
        }
      }

      const edit = new vscode.WorkspaceEdit();
      if (headerLineIndex >= 0) {
        // Find the end of this section (next heading or end of file)
        let endLineIndex = lines.length - 1;
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
          if (lines[i].startsWith("## ")) {
            endLineIndex = i - 1;
            break;
          }
        }

        const range = new vscode.Range(
          new vscode.Position(headerLineIndex, 0),
          document.lineAt(endLineIndex).range.end,
        );
        edit.replace(document.uri, range, referencesMarkdown.trimStart());
      } else {
        // Append to the end
        const endPos = document.lineAt(document.lineCount - 1).range.end;
        edit.insert(document.uri, endPos, referencesMarkdown);
      }

      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        vscode.l10n.t("References section updated!"),
      );
    },
  );
}
