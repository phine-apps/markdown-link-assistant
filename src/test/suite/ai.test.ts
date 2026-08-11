/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { generateAiSummary, generateAltText, clearAiCache } from "../../aiService";

suite("AI Service Test Suite", () => {
  let fetchStub: sinon.SinonStub;
  let configStub: sinon.SinonStub;
  const mockSecrets = {
    get: async (key: string) => `${key}-value`,
  } as unknown as vscode.SecretStorage;

  setup(() => {
    clearAiCache();
    fetchStub = sinon.stub(global, "fetch");
    configStub = sinon.stub(vscode.workspace, "getConfiguration");
  });

  teardown(() => {
    fetchStub.restore();
    configStub.restore();
  });

  test("should call OpenAI with correct prompt and parse response", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => (key === "aiProvider" ? "openai" : defaultValue),
    } as unknown as vscode.WorkspaceConfiguration);

    fetchStub.resolves({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OpenAI Summary Result" } }],
      }),
    } as unknown as Response);

    const summary = await generateAiSummary("url", "title", "desc", mockSecrets);
    assert.strictEqual(summary, "OpenAI Summary Result");
    
    // Verify fetch call
    const [url, init] = fetchStub.firstCall.args as [string, RequestInit];
    assert.strictEqual(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    assert.strictEqual(body.model, "gpt-4o-mini");
  });

  test("should call Gemini and parse response", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => (key === "aiProvider" ? "gemini" : defaultValue),
    } as unknown as vscode.WorkspaceConfiguration);

    fetchStub.resolves({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Gemini Summary Result" }] } }],
      }),
    } as unknown as Response);

    const summary = await generateAiSummary("url", "title", "desc", mockSecrets);
    assert.strictEqual(summary, "Gemini Summary Result");
    
    const [url] = fetchStub.firstCall.args as [string];
    assert.strictEqual(
      url,
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent",
    );
  });

  test("should handle AI refusal gracefully", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => (key === "aiProvider" ? "openai" : defaultValue),
    } as unknown as vscode.WorkspaceConfiguration);

    fetchStub.resolves({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "I am an AI and cannot summarize this." } }],
      }),
    } as unknown as Response);

    const summary = await generateAiSummary("url", "title", "desc", mockSecrets);
    assert.strictEqual(summary, ""); // Refusal detected and cleared
  });

  test("should call generateAltText with image data", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => (key === "aiProvider" ? "gemini" : defaultValue),
    } as unknown as vscode.WorkspaceConfiguration);

    // Mock image fetch
    fetchStub.onFirstCall().resolves({
      ok: true,
      arrayBuffer: async () => Buffer.from("fake-image-data"),
      headers: { get: () => "image/png" },
    } as unknown as Response);

    // Mock Gemini response
    fetchStub.onSecondCall().resolves({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "A beautiful landscape" }] } }],
      }),
    } as unknown as Response);

    const altText = await generateAltText("https://example.com/img.png", mockSecrets);
    assert.strictEqual(altText, "A beautiful landscape");
    
    // Verify Gemini part includes inline_data
    const args = fetchStub.secondCall.args as [string, RequestInit];
    const body = JSON.parse(args[1].body as string);
    const parts = body.contents[0].parts;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    assert.ok(parts.some((p: { inline_data?: unknown }) => p.inline_data), "Should contain image data");
  });

  test("should use custom OpenAI endpoint without redundant /v1", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => {
        if (key === "aiProvider") { return "openai"; }
        if (key === "openaiEndpoint") { return "https://custom.openai.proxy"; }
        return defaultValue;
      },
    } as unknown as vscode.WorkspaceConfiguration);

    fetchStub.resolves({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "result" } }] }),
    } as unknown as Response);

    await generateAiSummary("url", "title", "desc", mockSecrets);
    
    const [url] = fetchStub.firstCall.args as [string];
    // Should be https://custom.openai.proxy/chat/completions, NOT /v1/chat/completions
    assert.strictEqual(url, "https://custom.openai.proxy/chat/completions");
  });

  test("should use custom Claude endpoint", async () => {
    configStub.returns({
      get: (key: string, defaultValue: unknown) => {
        if (key === "aiProvider") { return "claude"; }
        if (key === "claudeEndpoint") { return "https://custom.claude.proxy"; }
        return defaultValue;
      },
    } as unknown as vscode.WorkspaceConfiguration);

    fetchStub.resolves({
      ok: true,
      json: async () => ({ content: [{ text: "result" }] }),
    } as unknown as Response);

    await generateAiSummary("url", "title", "desc", mockSecrets);
    
    const [url] = fetchStub.firstCall.args as [string];
    assert.strictEqual(url, "https://custom.claude.proxy/messages");
  });
});
