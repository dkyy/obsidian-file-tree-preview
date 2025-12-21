# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2024-12-21

### Added
- Show root folder setting: Display the vault name as a root folder containing all other folders
  - Root folder is open by default
  - Clicking the root folder shows files at the vault root level
  - Uses vault icon (or folders icon as fallback) in custom icon mode
  - Slightly more prominent styling to distinguish from regular folders
  - Toggle on/off via settings
- Pin to top functionality: Pin files to appear at the top of the preview panel
  - Right-click any file and select "Pin to top" to pin it
  - Pinned files show a 📌 indicator next to the filename
  - Pinned files stay at the top regardless of sort order
  - Uses shared localStorage for **cross-plugin compatibility** with File Tree Alternative plugin
  - Files pinned in either plugin will appear pinned in both
- External file drop support: Drag files from your OS into the plugin to import them
  - Drop files onto the preview panel to import into the currently selected folder
  - Drop files onto folder headers in the tree to import into specific folders
  - Automatic naming conflict resolution (adds numbers if file already exists)
  - Visual feedback with drop target highlighting
  - Success notifications and auto-open for single file imports
  - Works with all file types (images, PDFs, documents, etc.)
- Touch gesture support for mobile devices
  - Quick tap to select folders or open files
  - Long hold (500ms) to show context menus
  - Automatic menu cancellation when dragging
  - Note: Drag-and-drop file movement not supported on mobile (platform limitation)

### Improved
- Preview panel refresh optimization: Only updates when preview text actually changes
- Single card refresh: Updates individual cards instead of full panel to eliminate flicker
- Renamed CSS classes from `ftp-` to `ftpreview-` prefix for uniqueness
- Updated default styling: smaller fonts, more rounded corners, refined spacing
- Mobile launch behavior: Collapses sidebar and initializes from active file

### Fixed
- Fixed mobile launch flicker by properly initializing active file when view opens

## [1.0.8] - 2024-11-15

### Fixed
- Fixed sentence case issues identified by eslint-plugin-obsidianmd:
  - Capitalized "Markdown" as it's a proper noun (name of the markup language)
  - Capitalized "Buying" in Ko-fi link text for proper sentence case
  - Removed example syntax from link brackets setting description to avoid sentence detection issues

## [1.0.7] - 2024-11-15

### Fixed
- Corrected sentence case: lowercase "wiki links" and "markdown links" (common nouns, not proper nouns)
- Changed "buy me a coffee" to "buying me a coffee" for proper grammar

## [1.0.6] - 2024-11-15

### Fixed
- Capitalized "Wiki links" and "Markdown links" in settings description
- Changed "buying me a coffee" to "buy me a coffee" for correct grammar

## [1.0.5] - 2024-11-15

### Fixed
- All remaining sentence case issues in UI text (ribbon icon, settings, descriptions)
- Fixed unawaited promise in activateView
- Replaced type assertions with type predicates (TypeScript best practice)

## [1.0.4] - 2024-11-15

### Fixed
- Fixed folder indentation on iOS/iPadOS by using correct CSS property format ('padding-left' instead of paddingLeft)

## [1.0.3] - 2024-11-15

### Fixed
- Removed unused variable assignment (detailEl)
- Removed unnecessary type assertions by using proper Obsidian API
- Fixed sentence case in sort menu items (e.g., "Name (a to z)", "Date modified")

## [1.0.2] - 2024-11-14

### Fixed
- Complete compliance with all Obsidian plugin review requirements
- Replaced all inline styles with CSS classes and setCssProps() for better theming
- Fixed all Promise handling (added .catch() error handlers)
- Removed unnecessary type assertions and 'any' types
- Fixed async functions that had no await expressions
- Removed unused imports and variables
- All UI text now uses proper sentence case

## [1.0.1] - 2024-11-14

### Added
- Duplicate file option in file context menu - creates a copy of the selected file with " copy" appended to the name
- Table formatting removal in preview text - removes table separator lines (e.g., `|---|---|`) and pipe characters for cleaner preview display
- Drag-and-drop file movement - drag preview cards to folder headers to move files between folders
  - Custom drag ghost showing just filename in a pill/badge for better visibility while dragging
  - Visual feedback with accent color highlighting on drop targets
- Drag-and-drop folder movement - drag folder headers to other folders to reorganize folder structure
  - Prevents invalid moves (folder into itself, into descendants, into current parent)
  - User-friendly notices for invalid move attempts
  - Same semi-transparent drag ghost as files
- Delete option in folder context menu with confirmation dialog
  - Warning modal that explains deletion will include all folder contents
  - Safe default focus on Cancel button

### Fixed
- Preview panel now refreshes immediately after duplicating a file
- Preview panel now refreshes immediately after deleting a file
- Preview panel now refreshes immediately after renaming a file (via vault rename event)
- Fixed duplicate folder listings after drag-and-drop moves (added concurrent render protection to prevent overlapping tree renders)

## [1.0.0] - 2024-11-13

### Added
- Initial release
- Folder tree navigation with expandable/collapsible folders
- File preview cards showing content snippets
- Customizable preview lines (1-10)
- Custom folder icons via Iconize plugin integration
- Compact mode
- Configurable highlight colors (accent or neutral)
- Touch device support with automatic hover effect disable
- Comprehensive CSS customization via CSS variables
- Ko-fi donation link in settings
- Folder icons based on folder type (with/without subfolders)
- Right-click context menus for files and folders
- Rename, delete, new file, new folder options
- Column resizing with saved width preference
- Active file highlighting in preview panel
- Sort options for files (name, modified date, created date)
