/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getMetadataForUrl } from "./metadataService";
import { generateAiSummary } from "./aiService";
import { validateUrl, ValidationStatus } from "./validationService";
import { formatInline, formatCard, formatTitleOnly, isAlreadyUnfurled, getExistingLinkRange } from "./utils";

export async function bulkUnfurl(document: vscode.TextDocument, _secrets: vscode.SecretStorage) {
  const text = document.getText();
  const startVersion = document.version;
  // Match ALL URLs to identify potential links or raw URLs
  const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
  const matches: { url: string; range: vscode.Range }[] = [];
  const seenRanges = new Set<string>();

  let match;
  let processedUntilOffset = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    const matchStartOffset = match.index;
    
    // Skip if this URL is already part of a range we identified
    if (matchStartOffset < processedUntilOffset) {
      continue;
    }

    const startPos = document.positionAt(matchStartOffset);
    
    // Check if this URL is part of an existing link or card
    const existing = isAlreadyUnfurled(document, startPos) 
      ? getExistingLinkRange(document, startPos) 
      : undefined;

    let url = match[0];
    let range: vscode.Range;

    if (existing) {
      url = existing.url;
      range = existing.fullRange || existing.range;
    } else {
      range = new vscode.Range(startPos, document.positionAt(matchStartOffset + match[0].length));
    }

    // Mark this entire range as processed to avoid overlapping edits
    processedUntilOffset = document.offsetAt(range.end);

    const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
    if (!seenRanges.has(rangeKey)) {
      seenRanges.add(rangeKey);
      matches.push({ url, range });
    }
  }

  if (matches.length === 0) {
    vscode.window.showInformationMessage(vscode.l10n.t("No URLs or links found to process."));
    return;
  }

  interface UnfurlOption extends vscode.QuickPickItem {
    id: string;
  }

  const options: UnfurlOption[] = [
    {
      id: "url",
      label: vscode.l10n.t("URL Only"),
      description: vscode.l10n.t("Keep the raw URL as text"),
    },
    {
      id: "smart",
      label: vscode.l10n.t("Link (Title Only)"),
      description: vscode.l10n.t("Format as [Title](URL) without AI summary"),
    },
    {
      id: "inline",
      label: vscode.l10n.t("Inline Link"),
      description: vscode.l10n.t("Format as [Title](URL) with AI summary"),
    },
    {
      id: "card",
      label: vscode.l10n.t("Rich Card"),
      description: vscode.l10n.t("Format as Notion-style rich card"),
    },
  ];

  const selection = await vscode.window.showQuickPick(options, {
    placeHolder: vscode.l10n.t(
      "Select format for bulk unfurling ({0} links found)",
      matches.length,
    ),
  });

  if (!selection) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t("Bulk Unfurling {0} links...", matches.length),
      cancellable: true,
    },
    async (progress, token) => {
      const results: { range: vscode.Range; replacement: string }[] = [];
      const batchSize = 5;
      let aiErrorCount = 0;
      let lastAiError: string | undefined;

      for (let i = 0; i < matches.length; i += batchSize) {
        if (token.isCancellationRequested) {
          break;
        }

        const batch = matches.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ({ url, range }) => {
            if (token.isCancellationRequested) {
              return;
            }
            try {
              let replacement = "";

              if (selection.id === "url") {
                replacement = url;
              } else {
                // 1. Validate first
                const validation = await validateUrl(url);
                if (validation.status !== ValidationStatus.ok || token.isCancellationRequested) {
                  return;
                }

                // 2. Fetch Metadata
                const metadata = await getMetadataForUrl(url);
                if (token.isCancellationRequested) {
                  return;
                }

                // 3. Generate AI Summary (if applicable)
                let summary = "";
                if (selection.id === "inline" || selection.id === "card") {
                  try {
                    summary = await generateAiSummary(
                      url,
                      metadata.title,
                      metadata.description,
                      _secrets,
                    );
                  } catch (aiErr) {
                    aiErrorCount++;
                    lastAiError = (aiErr as Error).message;
                  }
                }
                
                if (token.isCancellationRequested) {
                  return;
                }

                // 4. Format
                if (selection.id === "smart") {
                  replacement = formatTitleOnly(url, metadata);
                } else if (selection.id === "inline") {
                  replacement = formatInline(url, metadata, summary);
                } else if (selection.id === "card") {
                  replacement = formatCard(url, metadata, summary);
                }
              }

              if (replacement && !token.isCancellationRequested) {
                results.push({ range, replacement });
              }
              if (!token.isCancellationRequested) {
                progress.report({ increment: (1 / matches.length) * 100 });
              }
            } catch (_e) {
              // Ignore errors for individual links
            }
          })
        );
      }

      if (token.isCancellationRequested) {
        vscode.window.showInformationMessage(vscode.l10n.t("Bulk unfurling was cancelled. No changes were applied."));
        return;
      }

      // 2. Sort results by position (reverse order) to ensure stable application
      results.sort((a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start));

      // Final overlap check before applying
      const finalResults: { range: vscode.Range; replacement: string }[] = [];
      let lastStartOffset = Number.MAX_SAFE_INTEGER;
      for (const res of results) {
        const startOffset = document.offsetAt(res.range.start);
        const endOffset = document.offsetAt(res.range.end);
        if (endOffset <= lastStartOffset) {
          finalResults.push(res);
          lastStartOffset = startOffset;
        } else {
          console.warn("Skipping overlapping edit at final check:", res.range);
        }
      }

      if (finalResults.length > 0) {
        const edit = new vscode.WorkspaceEdit();
        for (const res of finalResults) {
          edit.replace(document.uri, res.range, res.replacement);
        }

        if (document.version !== startVersion) {
          vscode.window.showWarningMessage(vscode.l10n.t("Document has been modified. Attempting to apply edits anyway..."));
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          vscode.window.showInformationMessage(
            vscode.l10n.t("Successfully unfurled {0} links!", finalResults.length)
          );
        } else {
          // Fallback: Try applying edits one by one to find the culprit
          console.error("WorkspaceEdit.applyEdit failed. Final results:", finalResults);
          
          let successCount = 0;
          for (const res of finalResults) {
            const singleEdit = new vscode.WorkspaceEdit();
            singleEdit.replace(document.uri, res.range, res.replacement);
            if (await vscode.workspace.applyEdit(singleEdit)) {
              successCount++;
            }
          }
          
          if (successCount > 0) {
            vscode.window.showInformationMessage(
              vscode.l10n.t("Applied {0}/{1} changes (some might have failed due to conflicts).", successCount, finalResults.length)
            );
          } else {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to apply bulk changes. Please check for overlapping links or document modifications."));
          }
        }
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t("No links were unfurled (they might be already unfurled or broken)."));
      }
      if (aiErrorCount > 0) {
        vscode.window.showWarningMessage(
          vscode.l10n.t("AI failed for {0} links. Last error: {1}", aiErrorCount, lastAiError || "Unknown")
        );
      }
    }
  );
}
