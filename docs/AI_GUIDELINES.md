# AI Assistant Guidelines

## 1. Version Control Policy
**NEVER automatically push to GitHub.**
All git push commands or actions that upload code to remote servers MUST require explicit user permission. The AI may commit code locally (git add, git commit), but must stop and ask before pushing.

### 1.1 GitHub Push Protocol & Changelog
Every time a version is pushed to GitHub, you MUST append an update log to `docs/logs/CHANGELOG.md` detailing the new features, UI refinements, and bug fixes made in that version.

### 1.2 Version Number Update Protocol
When preparing for a release/push, the version number MUST be synchronized across the following places:
1. docs/logs/CHANGELOG.md (as the header of the new release notes)
2. src/App.vue (in the bottom right corner footer text)
