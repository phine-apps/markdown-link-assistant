# Markdown Link Assistant Tutorial

This file is a sample document designed to help you experience the core features of the **Markdown Link Assistant** extension for VS Code.
Follow the steps in each section to try out the features.

---

## 1. Preview Feature
First, try hovering your mouse cursor over the URL below. A rich hover preview with the website's title, description, and OGP image should appear.

https://github.com/microsoft/vscode

## 2. Link Unfurling
Let's convert a raw URL into a more readable Markdown format.
Place your cursor on the URL below. You can click the `Link Assistant` hint (CodeLens) above the URL, use the "Unfurl..." button in the hover preview, or **right-click** and select **`Markdown Link: Unfurl Link at Cursor`**.

https://marketplace.visualstudio.com/vscode

## 3. Generate AI Alt Text
You can also use AI to generate descriptive text for images.
Select the image URL below.

https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800

AI will analyze the image (a laptop) and automatically insert an appropriate Alt text like `![A person working on a laptop](URL)`.

> ⚠️ To use AI features, you can use the **built-in AI (GitHub Copilot)** without any setup. Alternatively, you can configure an API key for Gemini, Claude, or OpenAI in the extension settings.

## 4. Generate References Section
Finally, let's automatically generate a list of all links cited in this document.

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type/execute:
**`Markdown Link: Generate References Section`**

A "References" section will be automatically created at the bottom of this file, including citation dates and metadata.

---
<!-- References will be generated below this line -->
