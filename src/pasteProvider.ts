/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getMetadataForUrl } from "./metadataService";
import { generateAiSummary } from "./aiService";
import { formatCard, formatInline, formatTitleOnly, isValidUrl } from "./utils";

export class MarkdownLinkAssistantPasteEditProvider
  implements vscode.DocumentPasteEditProvider
{
  private readonly secrets: vscode.SecretStorage;
  private readonly editMetadata = new WeakMap<
    vscode.DocumentPasteEdit,
    { originalUrl: string; mode: string }
  >();

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  async provideDocumentPasteEdits(
    _document: vscode.TextDocument,
    _ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit[]> {
    const textItem = dataTransfer.get("text/plain");
    if (!textItem) {
      return [];
    }

    const text = await textItem.asString();
    if (!text || !isValidUrl(text)) {
      return [];
    }

    const pastedText = (await textItem.asString()).trim();

    if (!isValidUrl(pastedText)) {
      return [];
    }

    const config = vscode.workspace.getConfiguration("markdown-link-assistant");
    const autoUnfurl = config.get<boolean>("autoUnfurl", true);
    const defaultFormat = config.get<string>("defaultPasteFormat", "title");

    if (!autoUnfurl || defaultFormat === "none") {
      return [];
    }


    const inlineEdit = new vscode.DocumentPasteEdit(
      pastedText,
      vscode.l10n.t("Markdown Link: Inline Link (AI Summary)"),
      vscode.DocumentDropOrPasteEditKind.Empty.append(
        "markdown",
        "link",
        "assistant",
        "inline",
      ),
    );
    this.editMetadata.set(inlineEdit, { originalUrl: pastedText, mode: "inline" });
    inlineEdit.yieldTo = [
      vscode.DocumentDropOrPasteEditKind.Empty.append("markdown", "link"),
    ];

    const cardEdit = new vscode.DocumentPasteEdit(
      pastedText,
      vscode.l10n.t("Markdown Link: Rich Card (AI Summary)"),
      vscode.DocumentDropOrPasteEditKind.Empty.append(
        "markdown",
        "link",
        "assistant",
        "card",
      ),
    );
    this.editMetadata.set(cardEdit, { originalUrl: pastedText, mode: "card" });
    cardEdit.yieldTo = [
      vscode.DocumentDropOrPasteEditKind.Empty.append("markdown", "link"),
    ];

    const smartTitleEdit = new vscode.DocumentPasteEdit(
      pastedText,
      vscode.l10n.t("Markdown Link: Link (Title Only)"),
      vscode.DocumentDropOrPasteEditKind.Empty.append(
        "markdown",
        "link",
        "assistant",
        "title",
      ),
    );
    this.editMetadata.set(smartTitleEdit, { originalUrl: pastedText, mode: "smart" });
    smartTitleEdit.yieldTo = [
      vscode.DocumentDropOrPasteEditKind.Empty.append("markdown", "link"),
    ];

    if (defaultFormat === "ask") {
      const askEdit = new vscode.DocumentPasteEdit(
        pastedText,
        vscode.l10n.t("Markdown Link: Select Format..."),
        vscode.DocumentDropOrPasteEditKind.Empty.append(
          "markdown",
          "link",
          "assistant",
          "ask",
        ),
      );
      this.editMetadata.set(askEdit, { originalUrl: pastedText, mode: "ask" });
      // Don't yield for 'ask' so it's the primary choice
      return [askEdit];
    }

    // Order edits so that the default format is first
    if (defaultFormat === "card") {
      return [cardEdit, inlineEdit, smartTitleEdit];
    } else if (defaultFormat === "inline") {
      return [inlineEdit, cardEdit, smartTitleEdit];
    } else {
      // Default to title first if set to title or unknown
      return [smartTitleEdit, inlineEdit, cardEdit];
    }


  }

  async resolveDocumentPasteEdit(
    pasteEdit: vscode.DocumentPasteEdit,
    token: vscode.CancellationToken,
  ): Promise<vscode.DocumentPasteEdit> {
    const metadata = this.editMetadata.get(pasteEdit);
    const url = metadata?.originalUrl;
    const mode = metadata?.mode;
    if (!url) {
      return pasteEdit;
    }

    try {
      const metadata = await getMetadataForUrl(url);
      if (token.isCancellationRequested) {
        pasteEdit.insertText = url;
        return pasteEdit;
      }

      let effectiveMode = mode;
      if (mode === "ask") {
        const options = [
          {
            label: vscode.l10n.t("URL Only"),
            description: vscode.l10n.t("Keep the raw URL as text"),
            id: "url",
          },
          {
            label: vscode.l10n.t("Link (Title Only)"),
            description: vscode.l10n.t("Format as [Title](URL) without AI"),
            id: "smart",
          },
          {
            label: vscode.l10n.t("Inline Link"),
            description: vscode.l10n.t("Format as [Title](URL) with AI summary"),
            id: "inline",
          },
          {
            label: vscode.l10n.t("Rich Card"),
            description: vscode.l10n.t("Format as HTML rich card"),
            id: "card",
          },
        ];



        const selection = await vscode.window.showQuickPick(options, {
          placeHolder: vscode.l10n.t("How do you want to paste this link?"),
        });
        if (!selection) {
          pasteEdit.insertText = url;
          return pasteEdit;
        }
        effectiveMode = selection.id;
      }

      if (effectiveMode === "url") {
        pasteEdit.insertText = url;
        return pasteEdit;
      }

      if (effectiveMode === "smart") {

        pasteEdit.insertText = formatTitleOnly(url, metadata);
        return pasteEdit;
      }

      let summary = "";
      try {
        summary = await generateAiSummary(
          url,
          metadata.title,
          metadata.description,
          this.secrets,
        );
      } catch (aiErr) {
        vscode.window.showWarningMessage(
          vscode.l10n.t("AI Summary failed: {0}. Proceeding with metadata only.", (aiErr as Error).message)
        );
      }

      if (token.isCancellationRequested) {
        pasteEdit.insertText = url;
        return pasteEdit;
      }

      if (effectiveMode === "card") {
        pasteEdit.insertText = formatCard(url, metadata, summary);
      } else {
        pasteEdit.insertText = formatInline(url, metadata, summary);
      }

    } catch (_err) {
      pasteEdit.insertText = url;
    }

    return pasteEdit;
  }
}
