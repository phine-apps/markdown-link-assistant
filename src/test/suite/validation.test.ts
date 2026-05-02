/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { validateUrl, ValidationStatus } from "../../validationService";

suite("Validation Service Test Suite", () => {
  let fetchStub: sinon.SinonStub;

  setup(() => {
    fetchStub = sinon.stub(global, "fetch" as any);
  });

  teardown(() => {
    fetchStub.restore();
  });

  test("should return OK for 200 response", async () => {
    fetchStub.resolves({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "text/html"]]),
    });

    const result = await validateUrl("https://example.com/ok", 1000);
    assert.strictEqual(result.status, ValidationStatus.ok);
    assert.strictEqual(result.statusCode, 200);
  });

  test("should return Broken for 404 response", async () => {
    fetchStub.resolves({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Map(),
    });

    const result = await validateUrl("https://example.com/missing", 1000);
    assert.strictEqual(result.status, ValidationStatus.broken);
    assert.strictEqual(result.statusCode, 404);
  });

  test("should return Timeout on AbortError", async () => {
    const error = new Error("AbortError");
    error.name = "AbortError";
    fetchStub.rejects(error);

    const result = await validateUrl("https://slow-site.com", 100);
    assert.strictEqual(result.status, ValidationStatus.timeout);
  });

  test("should return Error on network failure", async () => {
    fetchStub.rejects(new Error("Network connection lost"));

    const result = await validateUrl("https://no-internet.com", 1000);
    assert.strictEqual(result.status, ValidationStatus.error);
    assert.ok(result.message?.includes("Network connection lost"));
  });
});
