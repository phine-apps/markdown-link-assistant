/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { ensureRange } from "./utils";
import { MarkdownLinkAssistantPasteEditProvider } from "./pasteProvider";
import { generateReferencesSection } from "./referencesManager";
import {
  MarkdownLinkAssistantCodeActionProvider,
  unfurlAtCursor,
  generateAltTextCommand,
} from "./codeActionProvider";
import { clearValidationCache } from "./validationService";
import { clearAiCache } from "./aiService";

import { MarkdownLinkAssistantCodeLensProvider } from "./codeLensProvider";
import { MarkdownLinkAssistantHoverProvider } from "./hoverProvider";
import {
  createLinkDiagnosticCollection,
  updateDiagnostics,
} from "./diagnostics";
import { bulkUnfurl } from "./bulkManager";
import { getExistingLinkRange, isImageUrl } from "./utils";

/* eslint-disable @typescript-eslint/naming-convention */
const API_KEY_NAMES: Record<string, string> = {
  Gemini: "geminiApiKey",
  Claude: "claudeApiKey",
  OpenAI: "openaiApiKey",
};
/* eslint-enable @typescript-eslint/naming-convention */

function parseArgs(arg1: unknown, arg2: unknown): { url: string | undefined; range: vscode.Range | undefined } {
  if (Array.isArray(arg1)) {
    return { 
      url: typeof arg1[0] === 'string' ? arg1[0] : undefined, 
      range: arg1[1] ? ensureRange(arg1[1]) : undefined 
    };
  }
  // If arg1 is a vscode.Uri (common in context menus), it's not the URL we want to preview.
  return { 
    url: typeof arg1 === 'string' ? arg1 : undefined, 
    range: arg2 ? ensureRange(arg2) : undefined 
  };
}


export async function activate(context: vscode.ExtensionContext) {

  const secrets = context.secrets;
  const diagnosticCollection = createLinkDiagnosticCollection();
  context.subscriptions.push(diagnosticCollection);


  const selector: vscode.DocumentSelector = { language: "markdown" };

  // Register CodeLens Provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      selector,
      new MarkdownLinkAssistantCodeLensProvider(),
    ),
  );

  // Register Hover Provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      selector,
      new MarkdownLinkAssistantHoverProvider(),
    ),
  );

  // Register Document Paste Edit Provider
  const pasteProvider = new MarkdownLinkAssistantPasteEditProvider(secrets);
  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      selector,
      pasteProvider,
      {
        providedPasteEditKinds: [
          vscode.DocumentDropOrPasteEditKind.Empty.append(
            "markdown",
            "link",
            "assistant",
            "inline",
          ),
          vscode.DocumentDropOrPasteEditKind.Empty.append(
            "markdown",
            "link",
            "assistant",
            "card",
          ),
        ],
        pasteMimeTypes: ["text/plain"],
      },
    ),
  );

  // Register Code Action Provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      selector,
      new MarkdownLinkAssistantCodeActionProvider(),
      {
        providedCodeActionKinds:
          MarkdownLinkAssistantCodeActionProvider.providedCodeActionKinds,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.unfurlAtCursor",
      async (arg1?: unknown, arg2?: unknown) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const { url, range } = parseArgs(arg1, arg2);

        if (url && range) {
          await unfurlAtCursor(editor, url, range, secrets);
        } else {
          // 1. Try to find URL at current cursor position first
          const pos = editor.selection.active;
          const line = editor.document.lineAt(pos.line).text;
          const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
          let match;
          let urlAtCursor: { url: string; range: vscode.Range } | undefined;

          while ((match = urlRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (pos.character >= start && pos.character <= end) {
              urlAtCursor = { url: match[0], range: new vscode.Range(pos.line, start, pos.line, end) };
              break;
            }
          }

          if (urlAtCursor) {
            // Check if this URL is part of an existing link/card and use its full range
            const existing = getExistingLinkRange(editor.document, urlAtCursor.range.start);
            const targetRange = existing?.fullRange || existing?.range || urlAtCursor.range;
            const targetUrl = existing?.url || urlAtCursor.url;

            await unfurlAtCursor(editor, targetUrl, targetRange, secrets);
            return;
          }

          // 2. Fallback: Find all URLs in the document and let the user pick
          const urls = findAllUrlsWithRanges(editor.document);
          if (urls.length === 0) {
            vscode.window.showInformationMessage(vscode.l10n.t("No URLs found in the current document."));
            return;
          }

          if (urls.length === 1) {
            await unfurlAtCursor(editor, urls[0].url, urls[0].range, secrets);
            return;
          }

          const items = urls.map(u => ({
            label: u.url,
            description: vscode.l10n.t("Line {0}", u.range.start.line + 1),
            url: u.url,
            range: u.range
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("Select a URL to unfurl")
          });

          if (selected) {
            await unfurlAtCursor(editor, selected.url, selected.range, secrets);
          }
        }

      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.openLivePreview",
      async (arg1?: unknown) => {
        let { url } = parseArgs(arg1, undefined);

        if (!url || !url.startsWith("http")) {
          // If called without a valid URL arg, try to find URL at cursor
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return;
          }
          const pos = editor.selection.active;
          
          // 1. Try to find existing link/card first
          const existing = getExistingLinkRange(editor.document, pos);
          if (existing) {
            url = existing.url;
          } else {
            // 2. Fallback: Search for raw URL on current line
            const line = editor.document.lineAt(pos.line).text;
            const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
            let match;
            while ((match = urlRegex.exec(line)) !== null) {
              const start = match.index;
              const end = start + match[0].length;
              if (pos.character >= start && pos.character <= end) {
                url = match[0];
                break;
              }
            }
          }
        }

        if (url && url.startsWith("http")) {
          vscode.commands.executeCommand("simpleBrowser.show", url);
        } else {
          vscode.window.showInformationMessage(vscode.l10n.t("Cursor is not on a URL."));
        }
      },
    ),
  );



  // AI Alt Text Command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.generateAltText",
      async (arg1: unknown, arg2: unknown) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        const { url, range } = parseArgs(arg1, arg2);
        if (url && range) {
          await generateAltTextCommand(editor, url, range, secrets);
        } else {
          // Manual invocation if no arguments (e.g. from command palette)
          const pos = editor.selection.active;
          const line = editor.document.lineAt(pos.line).text;
          
          // Check if we are inside an existing link first
          const existing = getExistingLinkRange(editor.document, pos);
          if (existing && isImageUrl(existing.url)) {
            await generateAltTextCommand(editor, existing.url, existing.range, secrets);
            return;
          }

          const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
          let match;
          while ((match = urlRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (pos.character >= start && pos.character <= end) {
              const r = new vscode.Range(pos.line, start, pos.line, end);
              if (isImageUrl(match[0])) {
                await generateAltTextCommand(editor, match[0], r, secrets);
                return;
              }
            }
          }
          vscode.window.showInformationMessage(vscode.l10n.t("Cursor is not on an image URL."));
        }
      },

    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.refreshUnfurl",
      async (arg1: unknown, arg2: unknown) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        const { url, range } = parseArgs(arg1, arg2);
        if (url && range) {
          await unfurlAtCursor(editor, url, range, secrets);
        }
      },
    ),
  );

  const disposableRefs = vscode.commands.registerCommand(
    "markdown-link-assistant.generateReferences",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(vscode.l10n.t("No active text editor found."));
        return;
      }
      await generateReferencesSection(editor.document);
    },
  );


  // Bulk Validation Command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.validateLinks",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await updateDiagnostics(editor.document, diagnosticCollection);
        }
      },
    ),
  );

  // Bulk Unfurl Command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-link-assistant.bulkUnfurl",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await bulkUnfurl(editor.document, secrets);
        }
      },
    ),
  );

  // Event Listeners for Validation
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) =>
      updateDiagnostics(doc, diagnosticCollection),
    ),
    vscode.workspace.onDidSaveTextDocument((doc) =>
      updateDiagnostics(doc, diagnosticCollection),
    ),
  );

  // Initial validation for visible editors
  vscode.window.visibleTextEditors.forEach((editor) =>
    updateDiagnostics(editor.document, diagnosticCollection),
  );

  // --- API Key Management Commands ---
  const disposableSetKey = vscode.commands.registerCommand(
    "markdown-link-assistant.setApiKey",
    async () => {
      const provider = await vscode.window.showQuickPick(
        Object.keys(API_KEY_NAMES),
        { placeHolder: vscode.l10n.t("Select the AI provider to set the API key for") },
      );
      if (!provider) {
        return;
      }

      const apiKey = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Enter your {0} API key", provider),
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) {
        return;
      }

      await secrets.store(API_KEY_NAMES[provider], apiKey);
      
      const switchOption = vscode.l10n.t("Switch to {0} now", provider);
      const msg = vscode.l10n.t("{0} API key saved securely.", provider);
      const action = await vscode.window.showInformationMessage(msg, switchOption);
      
      if (action === switchOption) {
        const config = vscode.workspace.getConfiguration("markdown-link-assistant");
        await config.update("aiProvider", provider.toLowerCase(), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(vscode.l10n.t("AI Provider switched to {0}.", provider));
      }
    },
  );

  const disposableClearKey = vscode.commands.registerCommand(
    "markdown-link-assistant.clearApiKey",
    async () => {
      const provider = await vscode.window.showQuickPick(
        Object.keys(API_KEY_NAMES),
        { placeHolder: vscode.l10n.t("Select the AI provider to clear the API key for") },
      );
      if (!provider) {
        return;
      }

      await secrets.delete(API_KEY_NAMES[provider]);
      vscode.window.showInformationMessage(
        vscode.l10n.t("{0} API key cleared.", provider),
      );
    },
  );

  const disposableCheckKey = vscode.commands.registerCommand(
    "markdown-link-assistant.checkApiKey",
    async () => {
      const statuses: string[] = [];
      
      // Check Built-in AI (Copilot)
      const models = await vscode.lm.selectChatModels();
      const builtinStatus = models.length > 0 ? "✅" : "❌";
      statuses.push(`Built-in: ${builtinStatus}`);

      for (const [provider, keyName] of Object.entries(API_KEY_NAMES)) {
        const key = await secrets.get(keyName);
        const status = key ? "✅" : "❌";
        statuses.push(`${provider}: ${status}`);
      }
      vscode.window.showInformationMessage(statuses.join("  |  "));
    },
  );
  
  // Clear Cache Command
  const disposableClearCache = vscode.commands.registerCommand(
    "markdown-link-assistant.clearCache",
    () => {
      clearValidationCache();
      clearAiCache();
      vscode.window.showInformationMessage(vscode.l10n.t("All caches cleared."));
    }
  );

  context.subscriptions.push(
    disposableRefs,
    disposableSetKey,
    disposableClearKey,
    disposableCheckKey,
    disposableClearCache,
  );
}

export function deactivate() {}

function findAllUrlsWithRanges(document: vscode.TextDocument): { url: string; range: vscode.Range }[] {
  const urls: { url: string; range: vscode.Range }[] = [];
  const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
  let match;

  // We need to track lines to build Ranges
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    while ((match = urlRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // Check if it's already unfurled
      // (Optional: we might want to allow refreshing from the list too, 
      // but usually the list is for new URLs)
      // For now, let's include all raw URLs (not in [text](url))
      const charBefore = start > 0 ? line[start - 1] : "";
      if (charBefore !== "(" && charBefore !== "[") {
        urls.push({
          url: match[0],
          range: new vscode.Range(i, start, i, end)
        });
      }
    }
  }
  return urls;
}
