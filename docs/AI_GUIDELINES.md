# AI Assistant Guidelines

## 1. Version Control Policy
**NEVER automatically push to GitHub.**
All git push commands or actions that upload code to remote servers MUST require explicit user permission. The AI may commit code locally (git add, git commit), but must stop and ask before pushing.

### 1.1 GitHub Push Protocol & Changelog
Every time a version is pushed to GitHub, you MUST append an update log to `docs/logs/CHANGELOG.md` detailing the new features, UI refinements, and bug fixes made in that version.

