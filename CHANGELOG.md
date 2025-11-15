# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
