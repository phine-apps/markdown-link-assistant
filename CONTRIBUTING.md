# Contributing to Markdown Link Assistant

First off, thank you for considering contributing to Markdown Link Assistant!

## How Can I Contribute?

### Reporting Bugs

- **Check for existing issues** to see if it has already been reported.
- **Use a clear and descriptive title** for your issue.
- **Describe the exact steps** to reproduce the problem.

### Suggesting Enhancements

- **Make sure it fits the goals** of the project: creating a seamless link unfurling and summarizing experience in VS Code Markdown files.
- **Detail your idea** clearly, including the use case and expected behavior.

### Pull Requests

1. **Create a new branch** for your feature or bug fix (`git checkout -b feature/your-feature-name`).
2. **Write clear commit messages** explaining _what_ was changed and _why_.
3. **Include tests** for new functionality or bug fixes if possible.
4. **Ensure the build passes** and all checks are green before requesting a review.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/phine-apps/markdown-link-assistant.git
   cd markdown-link-assistant
   ```
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Compile and Lint:**
   ```bash
   pnpm run compile
   pnpm run lint
   pnpm run check-types
   ```
4. **Run Extension:**
   - Open this repository folder in VS Code.
   - Press `F5` to start debugging (Launches a new Extension Development Host window).

## Testing

We prioritize **unit tests** to ensure the reliability of individual services.

- **Run all tests:**
  ```bash
  pnpm test
  ```

### Testing Philosophy
- **Mocking**: We use `sinon` to mock external dependencies (APIs, network calls, VS Code APIs). This allows tests to run fast and offline.
- **Service Isolation**: Most logic is encapsulated in services (e.g., `MetadataService`, `AIService`). Always add or update unit tests in `src/test/suite/` when modifying these services.

## License

By contributing, you agree that your contributions will be licensed under the MIT License of the project.
