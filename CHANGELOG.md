# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
