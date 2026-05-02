/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getMetadataForUrl } from "./metadataService";
import { generateAiSummary, generateAltText } from "./aiService";
import {
  formatCard,
  formatInline,
  formatTitleOnly,
  isImageUrl,
  ensureRange,
  isAlreadyUnfurled,
  getExistingLinkRange,
} from "./utils";

export class MarkdownLinkAssistantCodeActionProvider
  implements vscode.CodeActionProvider
{
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.RefactorRewrite,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // 1. Check for raw URL (for initial unfurl or preview)
    const urlRange = this.getUrlAtPosition(document, range.start);
    if (urlRange) {
      const url = document.getText(urlRange);

      // Add Preview action for raw URL
      const previewAction = new vscode.CodeAction(
        vscode.l10n.t("Preview Link..."),
        vscode.CodeActionKind.Empty,
      );
      previewAction.command = {
        command: "markdown-link-assistant.openLivePreview",
        title: vscode.l10n.t("Live Preview"),
        arguments: [url],
      };
      actions.push(previewAction);

      // Only suggest Unfurl if it's NOT already in a markdown link or card
      if (!isAlreadyUnfurled(document, urlRange.start)) {
        const action = new vscode.CodeAction(
          vscode.l10n.t("Unfurl Link..."),
          vscode.CodeActionKind.RefactorRewrite,
        );
        action.command = {
          command: "markdown-link-assistant.unfurlAtCursor",
          title: "Unfurl Link",
          arguments: [url, urlRange],
        };
        actions.push(action);
      }

      // 1b. Check for Image URL specifically for AI Alt Text
      if (isImageUrl(url)) {
        const altTextAction = new vscode.CodeAction(
          vscode.l10n.t("Generate AI Alt Text"),
          vscode.CodeActionKind.RefactorRewrite,
        );
        altTextAction.command = {
          command: "markdown-link-assistant.generateAltText",
          title: "Generate Alt Text",
          arguments: [url, urlRange],
        };
        actions.push(altTextAction);
      }
    }

    // 2. Check for existing link/card (for Refresh, Preview, or AI Alt Text)
    const existingLink = getExistingLinkRange(document, range.start);
    if (existingLink) {
      // Preview for existing link
      const previewAction = new vscode.CodeAction(
        vscode.l10n.t("Preview Link..."),
        vscode.CodeActionKind.Empty,
      );
      previewAction.command = {
        command: "markdown-link-assistant.openLivePreview",
        title: vscode.l10n.t("Live Preview"),
        arguments: [existingLink.url],
      };
      actions.push(previewAction);

      const action = new vscode.CodeAction(
        vscode.l10n.t("Refresh Link Info"),
        vscode.CodeActionKind.RefactorRewrite,
      );
      action.command = {
        command: "markdown-link-assistant.refreshUnfurl",
        title: "Refresh Link",
        arguments: [existingLink.url, existingLink.fullRange || existingLink.range],
      };
      actions.push(action);

      // Suggest AI Alt Text if it's an image URL
      if (isImageUrl(existingLink.url)) {
        const altTextAction = new vscode.CodeAction(
          vscode.l10n.t("Generate AI Alt Text"),
          vscode.CodeActionKind.RefactorRewrite,
        );
        altTextAction.command = {
          command: "markdown-link-assistant.generateAltText",
          title: "Generate Alt Text",
          arguments: [existingLink.url, existingLink.range],
        };
        actions.push(altTextAction);
      }
    }

    return actions;
  }

  private getUrlAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Range | undefined {
    const line = document.lineAt(position.line).text;
    const urlRegex =
      /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
    let match;
    while ((match = urlRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (position.character >= start && position.character <= end) {
        return new vscode.Range(position.line, start, position.line, end);
      }
    }
    return undefined;
  }
}

export async function unfurlAtCursor(
  editor: vscode.TextEditor,
  url: string,
  range: vscode.Range,
  secrets?: vscode.SecretStorage,
) {
  const safeRange = ensureRange(range);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("Unfurling {0}...", url),
      cancellable: false,
    },
    async () => {
      try {
        const metadata = await getMetadataForUrl(url);

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
            description: vscode.l10n.t(
              "Format as [Title](URL) with AI summary",
            ),
            id: "inline",
          },
          {
            label: vscode.l10n.t("Rich Card"),
            description: vscode.l10n.t("Format as HTML rich card"),
            id: "card",
          },
        ];

        const selection = await vscode.window.showQuickPick(options, {
          placeHolder: vscode.l10n.t(
            "How do you want to unfurl this link? ({0})",
            metadata.title,
          ),
        });

        if (!selection) {
          return;
        }

        let summary = "";
        if (selection.id === "inline" || selection.id === "card") {
          try {
            summary = await generateAiSummary(
              url,
              metadata.title,
              metadata.description,
              secrets,
            );
          } catch (aiErr) {
            vscode.window.showWarningMessage(
              vscode.l10n.t(
                "AI Summary failed: {0}. Proceeding with metadata only.",
                (aiErr as Error).message,
              ),
            );
          }
        }

        let replacementText = "";
        if (selection.id === "url") {
          replacementText = url;
        } else if (selection.id === "inline") {
          replacementText = formatInline(url, metadata, summary);
        } else if (selection.id === "card") {
          replacementText = formatCard(url, metadata, summary);
        } else {
          replacementText = formatTitleOnly(url, metadata);
        }

        await editor.edit((editBuilder) => {
          editBuilder.replace(safeRange, replacementText);
        });
      } catch (err) {
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to unfurl link: {0}", (err as Error).message),
        );
      }
    },
  );
}

export async function generateAltTextCommand(
  editor: vscode.TextEditor,
  url: string,
  range: vscode.Range,
  secrets: vscode.SecretStorage,
) {
  let safeRange = ensureRange(range);
  let targetUrl = url;

  // Ensure we are replacing the full link if the URL is part of one
  const existing = getExistingLinkRange(editor.document, safeRange.start);
  if (existing && isImageUrl(existing.url)) {
    safeRange = existing.range;
    targetUrl = existing.url;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("Analyzing image and generating Alt Text..."),
      cancellable: false,
    },
    async () => {
      try {
        const altText = await generateAltText(targetUrl, secrets);
        if (!altText) {
          vscode.window.showWarningMessage(
            vscode.l10n.t(
              "AI could not describe this image. Make sure the image URL is accessible and your AI API key is correct.",
            ),
          );
          return;
        }

        const isOriginalImage = existing?.isImage ?? false;
        const replacementText = isOriginalImage ? `![${altText}](${targetUrl})` : `[${altText}](${targetUrl})`;

        await editor.edit((editBuilder) => {
          editBuilder.replace(safeRange, replacementText);
        });
      } catch (err) {
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to generate Alt Text: {0}", String(err)),
        );
      }
    },
  );
}
