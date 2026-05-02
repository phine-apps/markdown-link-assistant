/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { validateUrl, ValidationStatus } from "./validationService";

export const LINK_DIAGNOSTIC_SOURCE = "Markdown Link Assistant";
export const LINK_DIAGNOSTIC_CODE = "broken-link";

export function createLinkDiagnosticCollection(): vscode.DiagnosticCollection {
  return vscode.languages.createDiagnosticCollection("markdown-link-validation");
}

interface DiagnosticState {
  timeout?: NodeJS.Timeout;
  promise?: Promise<void>;
  resolver?: () => void;
}

const diagnosticStates = new Map<string, DiagnosticState>();

export async function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  token?: vscode.CancellationToken
): Promise<void> {
  if (document.languageId !== "markdown") {
    return;
  }

  const uri = document.uri.toString();
  let state = diagnosticStates.get(uri);
  if (!state) {
    state = {};
    diagnosticStates.set(uri, state);
  }

  // Debounce to avoid excessive calls
  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  if (!state.resolver) {
    state.promise = new Promise<void>((resolve) => {
      state!.resolver = resolve;
    });
  }

  state.timeout = setTimeout(async () => {
    const resolve = state?.resolver;
    state!.timeout = undefined;
    state!.resolver = undefined;
    state!.promise = undefined;

    try {
      await doUpdateDiagnostics(document, collection, token);
    } finally {
      resolve?.();
      // Cleanup if no longer needed
      if (!state!.timeout && !state!.resolver) {
        diagnosticStates.delete(uri);
      }
    }
  }, 500); // 500ms debounce

  return state.promise!;
}

async function doUpdateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  token?: vscode.CancellationToken
) {
  const text = document.getText();
  const urlRegex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
  const diagnostics: vscode.Diagnostic[] = [];
  const matches: { url: string; range: vscode.Range }[] = [];

  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (token?.isCancellationRequested) {
      return;
    }
    const range = new vscode.Range(
      document.positionAt(match.index),
      document.positionAt(match.index + match[0].length)
    );
    matches.push({ url: match[0], range });
  }

  if (matches.length === 0) {
    collection.set(document.uri, []);
    return;
  }

  // Validate in batches
  const batchSize = 5;
  for (let i = 0; i < matches.length; i += batchSize) {
    if (token?.isCancellationRequested) {
      break;
    }
    const batch = matches.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ({ url, range }) => {
        const result = await validateUrl(url);
        if (token?.isCancellationRequested) {
          return;
        }
        if (result.status !== ValidationStatus.ok) {
          const message = result.status === ValidationStatus.timeout
            ? vscode.l10n.t("Link validation timed out: {0}", url)
            : vscode.l10n.t("Broken link ({0}): {1}", result.statusCode || "Error", url);

          const diagnostic = new vscode.Diagnostic(
            range,
            message,
            result.status === ValidationStatus.broken
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = LINK_DIAGNOSTIC_SOURCE;
          diagnostic.code = LINK_DIAGNOSTIC_CODE;
          diagnostics.push(diagnostic);
        }
      })
    );
    
    // Update incrementally
    if (!token?.isCancellationRequested) {
      collection.set(document.uri, [...diagnostics]);
    }
  }
}
