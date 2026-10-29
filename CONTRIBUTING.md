# Contributing to DataMind AI

Thank you for your interest in contributing to **DataMind AI — Autonomous Data Science Platform**! We welcome bug reports, documentation enhancements, feature proposals, and pull requests.

## Code of Conduct

Please help maintain a welcoming, inclusive, and professional environment for everyone. Treat all contributors and reviewers with respect.

## Getting Started

1. **Fork the Repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/datamind-ai-autonomous-data-scientist.git
   cd datamind-ai-autonomous-data-scientist
   ```
3. **Set up Python Virtual Environment**:
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .\.venv\Scripts\Activate.ps1
   # Linux/macOS:
   source .venv/bin/activate

   pip install -r requirements.txt
   ```
4. **Install Node.js Dependencies**:
   ```bash
   npm install
   ```
5. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   (Provide your development values in `.env`. Never commit `.env` or personal secrets).

## Development Guidelines

- **Architecture Integrity**: Keep the ML pipeline in FastAPI (`ml_service/main.py`) and UI/orchestration in Express (`server.ts`) and React (`src/`).
- **Safe Fallbacks**: Any generative AI feature must have a deterministic local fallback when API keys are not present.
- **Resource Constraints**: Tabular algorithms should remain memory-safe for larger datasets.
- **Verification**: Always run quality checks before submitting a PR:
  ```bash
  npm run lint
  npm run build
  ```

## Submitting Pull Requests

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat(automl): add support for additional regression metric"
   ```
3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
4. Open a Pull Request against the `main` branch with a clear description of the problem solved, changes made, and verification steps.
