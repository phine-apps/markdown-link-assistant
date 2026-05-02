/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { generateReferencesSection } from "../../referencesManager";
import * as metadataService from "../../metadataService";

suite("References Manager Test Suite", () => {
  let getMetadataStub: sinon.SinonStub;

  setup(() => {
    getMetadataStub = sinon.stub(metadataService, "getMetadataForUrl");
  });

  teardown(() => {
    getMetadataStub.restore();
  });

  test("generateReferencesSection should add references when links exist", async () => {
    // Mock document with some markdown links
    const docContent = `
Here is a [Google link](https://google.com).
And a [GitHub link](https://github.com).
        `;

    const document = {
      uri: vscode.Uri.file("/fake/document.md"),
      getText: () => docContent,
      lineCount: docContent.split("\n").length,
      lineAt: (line: number) => ({
        range: new vscode.Range(line, 0, line, 100),
      }),
    } as unknown as vscode.TextDocument;

    getMetadataStub.withArgs("https://google.com").resolves({
      title: "Google",
      siteName: "Google Search",
    });

    getMetadataStub.withArgs("https://github.com").resolves({
      title: "GitHub",
      siteName: "GitHub Inc.",
    });

    const editBuilder = {
      insert: sinon.spy(),
    };

    const editor = {
      document,
      edit: async (callback: (builder: any) => void) => {
        callback(editBuilder);
        return true;
      },
    } as unknown as vscode.TextEditor;

    // Mock window.activeTextEditor
    const activeTextEditorStub = sinon
      .stub(vscode.window, "activeTextEditor")
      .value(editor);

    // Mock workspace.applyEdit
    const applyEditStub = sinon
      .stub(vscode.workspace, "applyEdit")
      .resolves(true);

    try {
      await generateReferencesSection(document);

      assert.ok(applyEditStub.calledOnce, "applyEdit should be called");
      const edit = applyEditStub.firstCall.args[0] as vscode.WorkspaceEdit;
      const entries = edit.entries();
      assert.strictEqual(entries.length, 1);

      const edits = entries[0][1];
      assert.strictEqual(edits.length, 1);
      const insertedText = edits[0].newText;

      assert.ok(insertedText.includes("## References"));
      assert.ok(insertedText.includes("Google. Google Search"));
      assert.ok(insertedText.includes("GitHub. GitHub Inc."));
    } finally {
      activeTextEditorStub.restore();
      applyEditStub.restore();
    }
  });

  test("generateReferencesSection should notify if no links found", async () => {
    const document = {
      uri: vscode.Uri.file("/fake/document.md"),
      getText: () => "No links here!",
    } as unknown as vscode.TextDocument;

    const showInfoStub = sinon.stub(vscode.window, "showInformationMessage");

    try {
      await generateReferencesSection(document);
      assert.ok(showInfoStub.calledWith("No links found in the document."));
    } finally {
      showInfoStub.restore();
    }
  });
});
