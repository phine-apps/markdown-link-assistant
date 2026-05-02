/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { validateUrl, ValidationStatus } from "../../validationService";
import { getMetadataForUrl } from "../../metadataService";

suite("Hardening & Bug Fixes Test Suite", () => {
  let fetchStub: sinon.SinonStub;

  setup(() => {
    fetchStub = sinon.stub(global, "fetch" as any);
  });

  teardown(() => {
    fetchStub.restore();
  });

  test("validateUrl should fallback to GET if HEAD returns 405", async () => {
    // First call returns 405
    fetchStub.onFirstCall().resolves({
      status: 405,
      ok: false,
      headers: new Map(),
    });
    // Second call (fallback) returns 200
    fetchStub.onSecondCall().resolves({
      status: 200,
      ok: true,
      headers: new Map([["content-type", "text/html"]]),
    });

    const result = await validateUrl("https://example.com/fallback", 1000);
    assert.strictEqual(result.status, ValidationStatus.ok);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(fetchStub.firstCall.args[1].method, "HEAD");
    assert.strictEqual(fetchStub.secondCall.args[1].method, "GET");
  });

  test("getMetadataForUrl should use correct encoding from content-type", async () => {
    const html = "<html><title>テスト</title></html>";
    // Mocking Shift-JIS encoded title would be complex with TextEncoder which is UTF-8 only in most envs,
    // but we can test if it passes the correct encoding string to TextDecoder constructor.
    
    // We'll mock TextDecoder to see what it's called with
    const textDecoderSpy = sinon.spy(global, "TextDecoder" as any);

    const encoder = new TextEncoder();
    const data = encoder.encode(html);
    let read = false;

    fetchStub.resolves({
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=shift-jis" : null),
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (read) {
              return { done: true, value: undefined };
            }
            read = true;
            return { done: false, value: data };
          },
          cancel: async () => {},
        }),
      },
    });

    await getMetadataForUrl("https://example.jp/sjis");
    
    // Check if TextDecoder was instantiated with shift-jis
    const decoderInstance = textDecoderSpy.firstCall;
    assert.strictEqual(decoderInstance.args[0], "shift-jis");
    
    textDecoderSpy.restore();
  });
});
