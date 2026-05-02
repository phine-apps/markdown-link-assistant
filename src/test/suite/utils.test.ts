/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { getExistingLinkRange, isImageUrl } from "../../utils";

suite("Utils Test Suite", () => {
  test("getExistingLinkRange should detect full link even if title is a URL", async () => {
    // Mock Document
    const lineText = "[https://example.com/img.png](https://example.com/img.png)";
    const mockDoc = {
      lineAt: () => ({ text: lineText }),
      lineCount: 1,
    } as unknown as vscode.TextDocument;

    // Position is inside the URL part
    const pos = new vscode.Position(0, 40);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.ok(result, "Should find existing link");
    assert.strictEqual(result?.url, "https://example.com/img.png");
    // Range should cover from start [ to end )
    assert.strictEqual(result?.range.start.character, 0);
    assert.strictEqual(result?.range.end.character, lineText.length);
  });

  test("getExistingLinkRange should detect link with summary comment", async () => {
    const lineText = "[Title](https://example.com) <!-- AI Summary -->";
    const mockDoc = {
      lineAt: () => ({ text: lineText }),
      lineCount: 1,
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(0, 10);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.ok(result, "Should find existing link");
    assert.strictEqual(result?.range.end.character, lineText.length);
  });

  test("getExistingLinkRange should return undefined for raw URL", async () => {
    const lineText = "Check this out: https://example.com";
    const mockDoc = {
      lineAt: () => ({ text: lineText }),
      lineCount: 1,
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(0, 20);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.strictEqual(result, undefined, "Should NOT find link for raw URL");
  });

  test("getExistingLinkRange should detect image link including leading !", async () => {
    const lineText = "![Alt](https://example.com/img.png)";
    const mockDoc = {
      lineAt: () => ({ text: lineText }),
      lineCount: 1,
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(0, 10);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.ok(result, "Should find existing image link");
    assert.strictEqual(result?.range.start.character, 0, "Range should start before !");
    assert.strictEqual(result?.range.end.character, lineText.length, "Range should end after )");
  });
  
  test("getExistingLinkRange should detect link with escaped brackets in title", async () => {
    const lineText = "[\\[AI\\] Title](https://example.com)";
    const mockDoc = {
      lineAt: () => ({ text: lineText }),
      lineCount: 1,
    } as unknown as vscode.TextDocument;

    const pos = new vscode.Position(0, 20);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.ok(result, "Should find existing link with escaped brackets");
    assert.strictEqual(result?.url, "https://example.com");
    assert.strictEqual(result?.range.start.character, 0);
    assert.strictEqual(result?.range.end.character, lineText.length);
  });

  test("isImageUrl should identify Unsplash URLs as images", () => {
    const unsplashUrl = "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800";
    assert.strictEqual(isImageUrl(unsplashUrl), true, "Unsplash URL should be recognized as image");
  });

  test("isImageUrl should identify .webp URLs as images", () => {
    assert.strictEqual(isImageUrl("https://example.com/image.webp"), true);
  });

  test("isImageUrl should NOT identify generic URLs as images", () => {
    assert.strictEqual(isImageUrl("https://google.com"), false);
  });

  test("getExistingLinkRange should detect HTML Card blocks correctly", () => {
    const html = `<div data-markdown-link-assistant-card="true">
<div style="display: flex;">
<a href="https://marketplace.visualstudio.com/vscode">Marketplace</a>
</div>
</div>`;
    const lines = html.split("\n");
    const mockDoc = {
      lineAt: (idx: number) => ({ text: lines[idx] }),
      lineCount: lines.length,
    } as unknown as vscode.TextDocument;

    // Hovering on the link line (line index 2)
    const pos = new vscode.Position(2, 10);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.ok(result, "Should find the card");
    assert.strictEqual(result?.url, "https://marketplace.visualstudio.com/vscode");
    assert.strictEqual(result?.range.start.line, 0, "Card should start at line 0");
    assert.strictEqual(result?.range.end.line, 4, "Card should end at line 4");
  });

  test("getExistingLinkRange should NOT detect card if cursor is below it", () => {
    const html = `<div data-markdown-link-assistant-card="true">
<a href="https://example.com">Link</a>
</div>

https://unsplash.com/photo-123`;
    const lines = html.split("\n");
    const mockDoc = {
      lineAt: (idx: number) => ({ text: lines[idx] }),
      lineCount: lines.length,
    } as unknown as vscode.TextDocument;

    // Cursor is on line 4 (the Unsplash URL), which is OUTSIDE the card (ends at line 2)
    const pos = new vscode.Position(4, 5);
    const result = getExistingLinkRange(mockDoc, pos);

    assert.strictEqual(result, undefined, "Should NOT find card for position below it");
  });
});
