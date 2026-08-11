# Changelog

All notable changes to the "Markdown Link Assistant" extension will be documented in this file.

## [1.1.0] - 2026-08-11

### Added
- Rich card support for Zenn, Qiita, and Stack Overflow.
- Format YouTube video duration in previews.
- Display forks and issues counts for GitHub links.

### Changed
- Updated default Gemini model to `gemini-3.6-flash`, Claude model to `claude-sonnet-5`, and OpenAI model to `gpt-5-mini` due to deprecation of previous models.
- Removed "last updated" time extraction from GitHub links to avoid API rate limits and adapt to GitHub UI changes.

### Fixed
- Fixed missing "likes" extraction for Qiita and Zenn articles.
- Fixed Cloudflare blocking on Stack Overflow links by migrating to the Stack Exchange API to correctly display scores, answers, and descriptions.
- Fixed a bug where missing metadata resulted in "Unknown" placeholders instead of hiding gracefully.
- Stricter URL validation for paste unfurl.
- Abort and discard edits on Bulk Unfurl cancellation.
- Sanitize URL host matching and escape backslashes in markdown titles.

## [1.0.1] - 2026-05-02

### Changed
- Internal CI/CD improvements and build script stability fixes.

## [1.0.0] - 2026-05-02

### Added

- Initial release of **Markdown Link Assistant**.
- **Smart Unfurling**: Transform URLs into rich previews or Notion-like cards.
- **AI Summaries**: Automatic page descriptions using GitHub Copilot, Gemini, Claude, or OpenAI.
- **Instant Preview**: Verification of links within VS Code's built-in browser.
- **Multi-language Support**: Fully localized for English, Japanese, and Simplified Chinese.
- **Metadata Management**: Refresh and update link info with a single click.
