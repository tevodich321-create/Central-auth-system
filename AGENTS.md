# Graphify + Codex

This repository is configured to work with the official Graphify CLI and Codex.

## Rules

- For codebase architecture, file relationships, data flow, and implementation questions, prefer Graphify when `graphify-out/graph.json` exists.
- Never claim Graphify was run unless a real command completed successfully.
- Never invent Graphify output, nodes, edges, files, errors, tests, or implementation status.
- For a first analysis, run `graphify .` when the Graphify CLI is installed and the user asks for repository-wide understanding.
- For a GitHub repository URL, Graphify can clone it with `graphify clone <url>`.
- For an existing graph, answer repository questions with `graphify query "<question>"`, `graphify explain "<node>"`, or `graphify path "<A>" "<B>"` as appropriate.
- Use `graphify --update` for incremental updates after changes.
- Code extraction is local and deterministic; do not ask for an API key for a code-only repository.
- If a required command is unavailable, report the exact missing prerequisite and stop rather than pretending it worked.
