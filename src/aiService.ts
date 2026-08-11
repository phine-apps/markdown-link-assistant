/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as vscode from "vscode";
import { getDispatcher } from "./proxy";

const summaryCache = new Map<string, string>();
const MAX_SUMMARY_CACHE_SIZE = 100;

function addToSummaryCache(url: string, summary: string) {
  if (summaryCache.size >= MAX_SUMMARY_CACHE_SIZE) {
    const firstKey = summaryCache.keys().next().value;
    if (firstKey !== undefined) {
      summaryCache.delete(firstKey);
    }
  }
  summaryCache.set(url, summary);
}

export function clearAiCache() {
  summaryCache.clear();
}

function filterRefusal(text: string): string {
  const clean = text.trim().replace(/\n/g, " ");
  const lower = clean.toLowerCase();
  // Filter out AI refusal common phrases
  if (
    lower.includes("sorry") &&
    (lower.includes("assist") || lower.includes("help"))
  ) {
    return "";
  }
  if (lower.includes("i am an ai") || lower.includes("cannot summarize")) {
    return "";
  }
  return clean;
}

export async function generateAltText(
  imageUrl: string,
  secrets: vscode.SecretStorage,
): Promise<string> {
  const config = vscode.workspace.getConfiguration("markdown-link-assistant");
  const provider = config.get<string>("aiProvider", "builtin");

  const langName = getLanguageName();
  const prompt = `Describe this image in one concise sentence (max 80 characters) for use as a Markdown alt-text. Please provide the description in ${langName}. Do not include "Image of" or "This is a". Just the description.`;

  const imageData = await fetchImageBase64(imageUrl);

  if (provider === "builtin") {
    // Built-in AI (Copilot) currently doesn't support images in the stable API for extensions easily
    // We'll fall back to text-only if needed, but for now we'll try to provide the URL if the model is smart
    return await callBuiltInAi(prompt + "\nImage URL: " + imageUrl);
  } else if (provider === "gemini") {
    const apiKey = (await secrets.get("geminiApiKey")) ?? "";
    const result = await callGemini(prompt, apiKey, imageData);
    return filterRefusal(result);
  } else if (provider === "claude") {
    const apiKey = (await secrets.get("claudeApiKey")) ?? "";
    const result = await callClaude(prompt, apiKey, imageData);
    return filterRefusal(result);
  } else if (provider === "openai") {
    const apiKey = (await secrets.get("openaiApiKey")) ?? "";
    const result = await callOpenAI(prompt, apiKey, imageData);
    return filterRefusal(result);
  }

  return "";
}

export async function generateAiSummary(
  url: string,
  title: string,
  description: string = "",
  secrets?: vscode.SecretStorage,
): Promise<string> {
  const cached = summaryCache.get(url);
  if (cached) {
    return cached;
  }

  const config = vscode.workspace.getConfiguration("markdown-link-assistant");
  const provider = config.get<string>("aiProvider", "builtin");

  const langName = getLanguageName();

  const prompt = `You are an expert summarization assistant. Summarize the following web page content for a link hover preview in ${langName}.
Use the provided Title and Description as context, but provide a comprehensive and complete summary of what this page or service is.
Your summary must be 1 to 2 complete, descriptive sentences that conclude properly with a period (or punctuation).
Do not truncate your response. Do not use phrases like "This page is" or "This website is".

[URL]
${url}
[/URL]

[TITLE]
${title}
[/TITLE]

[DESCRIPTION]
${description}
[/DESCRIPTION]

Summary:`;

  if (provider === "builtin") {
    const summary = await callBuiltInAi(prompt);
    if (summary) {
      addToSummaryCache(url, summary);
    }
    return summary;
  } else if (provider === "gemini") {
    const apiKey = (await secrets?.get("geminiApiKey")) ?? "";
    const result = await callGemini(prompt, apiKey);
    const summary = filterRefusal(result);
    if (summary) {
      addToSummaryCache(url, summary);
    }
    return summary;
  } else if (provider === "claude") {
    const apiKey = (await secrets?.get("claudeApiKey")) ?? "";
    const result = await callClaude(prompt, apiKey);
    const summary = filterRefusal(result);
    if (summary) {
      addToSummaryCache(url, summary);
    }
    return summary;
  } else if (provider === "openai") {
    const apiKey = (await secrets?.get("openaiApiKey")) ?? "";
    const result = await callOpenAI(prompt, apiKey);
    const summary = filterRefusal(result);
    if (summary) {
      addToSummaryCache(url, summary);
    }
    return summary;
  }

  return "";
}

async function fetchImageBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: getDispatcher() as any,
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: "image/avif,image/webp,image/apng,image/*",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Referer: "https://www.google.com/",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(
        `The URL returned ${contentType} instead of an image. The hosting service may be blocking the request. Try opening the URL in your browser first.`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback if stream is not available
      const arrayBuffer = await response.arrayBuffer();
      return {
        data: Buffer.from(arrayBuffer).toString("base64"),
        mimeType: response.headers.get("content-type") || "image/jpeg",
      };
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          if (totalLength + value.length > MAX_IMAGE_SIZE) {
            await reader.cancel();
            throw new Error("Image too large (exceeds 5MB)");
          }
          chunks.push(value);
          totalLength += value.length;
        }
      }
    } finally {
      reader.cancel();
    }

    const completeBuffer = Buffer.concat(chunks);
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return {
      data: completeBuffer.toString("base64"),
      mimeType,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callBuiltInAi(prompt: string): Promise<string> {
  let models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
  if (models.length === 0) {
    models = await vscode.lm.selectChatModels();
  }

  if (models.length > 0) {
    const model = models[0];
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const response = await model.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token,
    );
    let summary = "";
    for await (const fragment of response.text) {
      summary += fragment;
    }

    return filterRefusal(summary);
  } else {
    throw new Error(
      vscode.l10n.t(
        "No AI models found. Please make sure GitHub Copilot is enabled.",
      ),
    );
  }
}

async function callGemini(
  prompt: string,
  apiKey: string,
  imageData?: { data: string; mimeType: string },
): Promise<string> {
  if (!apiKey) {
    return "";
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const parts: unknown[] = [{ text: prompt }];
    if (imageData) {
      parts.push({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        inline_data: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          mime_type: imageData.mimeType,
          data: imageData.data,
        },
      });
    }

    const config = vscode.workspace.getConfiguration("markdown-link-assistant");
    const modelName = config.get<string>("geminiModel", "gemini-3.6-flash");
    const apiVersion = modelName.includes("preview") ? "v1beta" : "v1";
    const customEndpoint = config.get<string>("geminiEndpoint", "");
    const baseUrl =
      customEndpoint.replace(/\/$/, "") ||
      "https://generativelanguage.googleapis.com";

    const response = await fetch(
      `${baseUrl}/${apiVersion}/models/${modelName}:generateContent`,
      {
        method: "POST",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatcher: getDispatcher() as any,
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Content-Type": "application/json",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const candidates = data?.candidates?.[0]?.content?.parts || [];
    const text = candidates.map((p) => p.text || "").join("");
    return text.trim().replace(/\n/g, " ");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callClaude(
  prompt: string,
  apiKey: string,
  imageData?: { data: string; mimeType: string },
): Promise<string> {
  if (!apiKey) {
    return "";
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (imageData) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          media_type: imageData.mimeType,
          data: imageData.data,
        },
      });
    }

    const config = vscode.workspace.getConfiguration("markdown-link-assistant");
    const modelName = config.get<string>(
      "claudeModel",
      "claude-sonnet-5",
    );
    const customEndpoint = config.get<string>("claudeEndpoint", "");
    const baseUrl =
      customEndpoint.replace(/\/$/, "") || "https://api.anthropic.com/v1";

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: getDispatcher() as any,
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "x-api-key": apiKey,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        max_tokens: 400,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Claude API failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    return data?.content?.[0]?.text?.trim().replace(/\n/g, " ") || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  imageData?: { data: string; mimeType: string },
): Promise<string> {
  if (!apiKey) {
    return "";
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (imageData) {
      content.push({
        type: "image_url",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        image_url: {
          url: `data:${imageData.mimeType};base64,${imageData.data}`,
        },
      });
    }

    const config = vscode.workspace.getConfiguration("markdown-link-assistant");
    const modelName = config.get<string>("openaiModel", "gpt-5-mini");
    const customEndpoint = config.get<string>("openaiEndpoint", "");
    const baseUrl =
      customEndpoint.replace(/\/$/, "") || "https://api.openai.com/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatcher: getDispatcher() as any,
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        max_tokens: 400,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI API failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return (
      data?.choices?.[0]?.message?.content?.trim().replace(/\n/g, " ") || ""
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function getLanguageName(): string {
  const lang = vscode.env.language;
  if (lang.startsWith("ja")) {
    return "Japanese";
  } else if (lang.startsWith("zh")) {
    return "Simplified Chinese";
  }
  return "English";
}
