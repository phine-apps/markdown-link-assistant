/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from 'vscode';

export class MarkdownLinkAssistantCodeLensProvider implements vscode.CodeLensProvider {
    public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
        const config = vscode.workspace.getConfiguration("markdown-link-assistant");
        if (!config.get<boolean>("enableCodeLens", true)) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        const rawText = document.getText();
        const lines = rawText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const regex = /https?:\/\/[^\s)\]"'<>]+(?:\([^\s)\]"'<>]+\)[^\s)\]"'<>]*)*/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
                const url = match[0];
                const startPos = match.index;
                
                // Avoid URLs that are already part of a link [text](url) or (url)
                const beforeChar = startPos > 0 ? line[startPos - 1] : "";
                if (beforeChar === "(" || beforeChar === "[" || beforeChar === "\"" || beforeChar === "'") {
                    continue;
                }

                const range = new vscode.Range(i, startPos, i, startPos + url.length);
                
                // 1. Unfurl CodeLens
                lenses.push(new vscode.CodeLens(range, {
                    title: vscode.l10n.t("$(symbol-link) Unfurl Link..."),
                    command: "markdown-link-assistant.unfurlAtCursor",
                    arguments: [url, range]
                }));

                // 2. Preview CodeLens
                lenses.push(new vscode.CodeLens(range, {
                    title: vscode.l10n.t("$(eye) Live Preview..."),
                    command: "markdown-link-assistant.openLivePreview",
                    arguments: [url]
                }));
            }
        }

        return lenses;
    }
}
