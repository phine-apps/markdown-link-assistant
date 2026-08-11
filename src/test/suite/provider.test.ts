/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { MarkdownLinkAssistantPasteEditProvider } from "../../pasteProvider";

const mockSecrets = {
  get: async () => undefined,
  store: async () => {},
  delete: async () => {},
  onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
} as unknown as vscode.SecretStorage;

suite("Paste Provider Logic Test", () => {
  const provider = new MarkdownLinkAssistantPasteEditProvider(mockSecrets);
  let configStub: sinon.SinonStub;

  setup(() => {
    configStub = sinon.stub(vscode.workspace, "getConfiguration");
  });

  teardown(() => {
    configStub.restore();
  });

  test("Should identify valid URLs", async () => {
    configStub.returns({
      get: (key: string) => {
        if (key === "autoUnfurl") { return true; }
        if (key === "defaultPasteFormat") { return "inline"; }
        return undefined;
      }
    } as unknown as vscode.WorkspaceConfiguration);

    // Mocking DataTransfer
    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set(
      "text/plain",
      new vscode.DataTransferItem("https://www.google.com"),
    );

    // Calling provider directly
    const edits = await provider.provideDocumentPasteEdits(
      {} as unknown as vscode.TextDocument,
      [] as unknown as vscode.Range[],
      dataTransfer,
      {} as unknown as vscode.DocumentPasteEditContext,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(
      edits.length,
      3,
      "Should return three edits when not in 'ask' mode",
    );
    // Labels are localized, so we check if they contain keywords
    assert.ok(edits[0].title.includes("Inline Link"));
    assert.ok(edits[1].title.includes("Rich Card"));
    assert.ok(edits[2].title.includes("Link (Title Only)"));
  });

  test("Should ignore non-URL text", async () => {
    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set("text/plain", new vscode.DataTransferItem("Hello world"));

    const edits = await provider.provideDocumentPasteEdits(
      {} as unknown as vscode.TextDocument,
      [] as unknown as vscode.Range[],
      dataTransfer,
      {} as unknown as vscode.DocumentPasteEditContext,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(
      edits.length,
      0,
      "Should not return any edit for non-URL text",
    );
  });

  test("Should ignore URLs without protocol to prevent code snippet false positives", async () => {
    configStub.returns({
      get: (key: string) => {
        if (key === "autoUnfurl") { return true; }
        if (key === "defaultPasteFormat") { return "ask"; }
        return undefined;
      }
    } as unknown as vscode.WorkspaceConfiguration);

    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set("text/plain", new vscode.DataTransferItem("example.com"));

    const edits = await provider.provideDocumentPasteEdits(
      {} as unknown as vscode.TextDocument,
      [] as unknown as vscode.Range[],
      dataTransfer,
      {} as unknown as vscode.DocumentPasteEditContext,
      new vscode.CancellationTokenSource().token,
    );

    assert.strictEqual(
      edits.length,
      0,
      "Should ignore example.com as a valid URL without a protocol",
    );
  });
});
