/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { getMetadataForUrl } from "../../metadataService";

suite("Metadata Service Test Suite", () => {
  let fetchStub: sinon.SinonStub;

  setup(() => {
    fetchStub = sinon.stub(global, "fetch");
  });

  teardown(() => {
    fetchStub.restore();
  });

  function mockResponse(html: string, contentType: string = "text/html") {
    const encoder = new TextEncoder();
    const data = encoder.encode(html);
    let read = false;

    return {
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
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
    };
  }

  test("should extract metadata from OpenGraph tags", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="OG Description" />
          <meta property="og:image" content="https://example.com/image.png" />
          <meta property="og:site_name" content="Example Site" />
        </head>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://example.com/page";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.title, "OG Title");
    assert.strictEqual(metadata.description, "OG Description");
    assert.strictEqual(metadata.image, "https://example.com/image.png");
    assert.strictEqual(metadata.siteName, "Example Site");
  });

  test("should fall back to <title> if OG title is missing", async () => {
    const html = `
      <html>
        <head>
          <title>HTML Title</title>
        </head>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://example.com/page-fallback";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.title, "HTML Title");
  });

  test("should return URL as title if fetching fails", async () => {
    fetchStub.resolves({
      ok: false,
    } as Response);

    const url = "https://broken-link-fail.com";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.title, url);
  });

  test("should extract YouTube specific metadata", async () => {
    const html = `
      <html>
        <head>
          <link itemprop="name" content="Creator Name" />
          <meta itemprop="duration" content="PT10M30S" />
          <meta itemprop="datePublished" content="2023-01-01" />
        </head>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://www.youtube.com/watch?v=unique123";
    const metadata = await getMetadataForUrl(url);

    assert.ok(metadata.youtube);
    assert.strictEqual(metadata.youtube?.channelName, "Creator Name");
    assert.strictEqual(metadata.youtube?.duration, "PT10M30S");
  });

  test("should only take the first <title> tag if multiple exist (e.g. SVG titles)", async () => {
    const html = `
      <html>
        <head>
          <title>Real Title</title>
        </head>
        <body>
          <svg><title>Icon Title</title></svg>
          <svg><title>Another Icon</title></svg>
        </body>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://example.com/multiple-titles";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.title, "Real Title");
  });

  test("should NOT extract YouTube metadata for third-party host with youtube.com in path or query", async () => {
    const html = `
      <html>
        <head>
          <title>Attacker Page</title>
          <link itemprop="name" content="Fake Channel" />
        </head>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://attacker.com/youtube.com/watch?v=123";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.youtube, undefined, "Third party URL should not have youtube metadata");
  });

  test("should NOT extract GitHub metadata for third-party host with github.com in path", async () => {
    const html = `
      <html>
        <head>
          <title>Fake Repo</title>
        </head>
      </html>
    `;

    fetchStub.resolves(mockResponse(html) as unknown as Response);

    const url = "https://evil.com/github.com/org/repo";
    const metadata = await getMetadataForUrl(url);

    assert.strictEqual(metadata.github, undefined, "Third party URL should not have github metadata");
  });
});
