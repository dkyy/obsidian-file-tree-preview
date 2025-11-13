# Release Instructions

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `obsidian-file-tree-preview`
3. Description: "Obsidian plugin for navigating folders with preview cards"
4. Make it **Public**
5. Do NOT initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push Code to GitHub

Run these commands in your terminal:

```bash
cd "/Users/david/Library/Mobile Documents/iCloud~md~obsidian/Documents/Art/.obsidian/plugins/file-tree-preview"

# Initialize git repository
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial release v1.0.0"

# Set main branch
git branch -M main

# Add your GitHub repo as remote
git remote add origin https://github.com/dkyy/obsidian-file-tree-preview.git

# Push to GitHub
git push -u origin main
```

## Step 3: Create GitHub Release

1. Go to https://github.com/dkyy/obsidian-file-tree-preview/releases/new
2. Click "Choose a tag" and type: `1.0.0`
3. Click "Create new tag: 1.0.0 on publish"
4. Release title: `1.0.0`
5. Description:
   ```
   Initial release of File Tree Preview plugin.

   Features:
   - Folder tree navigation with expandable/collapsible folders
   - File preview cards showing content snippets
   - Customizable preview lines (1-10)
   - Custom folder icons via Iconize plugin integration
   - Compact mode
   - Configurable highlight colors
   - Touch device support
   - Comprehensive CSS customization
   ```
6. Attach these files by dragging them into the release:
   - `main.js`
   - `manifest.json`
   - `styles.css`
7. Click "Publish release"

## Step 4: Submit to Obsidian Community Plugins

1. Fork the official repo: https://github.com/obsidianmd/obsidian-releases/fork
2. Clone your fork locally
3. Add your plugin entry to `community-plugins.json` (alphabetically):
   ```json
   "file-tree-preview": {
       "id": "file-tree-preview",
       "name": "File Tree Preview",
       "author": "David Young",
       "description": "Navigate folders in a tree structure with preview cards showing file content snippets, following the macOS column-based pattern",
       "repo": "dkyy/obsidian-file-tree-preview"
   }
   ```
4. Commit and push the change
5. Create a pull request to the main obsidian-releases repo
6. Wait for Obsidian team review (typically takes a few days to weeks)

## Files Already Prepared ✓

- ✓ manifest.json (with your name and GitHub URL)
- ✓ main.js (built and ready)
- ✓ styles.css
- ✓ README.md
- ✓ LICENSE (MIT)
- ✓ .gitignore
