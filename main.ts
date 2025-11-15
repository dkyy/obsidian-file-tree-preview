import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, TFile, TFolder, Menu, Modal, Notice, setIcon } from 'obsidian';

const VIEW_TYPE_FILE_TREE_PREVIEW = "file-tree-preview-view";

type SortOrder = "name-asc" | "name-desc" | "modified-new" | "modified-old" | "created-new" | "created-old";

type FolderIconStyle = "none" | "custom" | "folder";

interface FileTreePreviewData {
	collapsedFolders: string[];
	sortOrder: SortOrder;
	treeWidth: number;
	previewLines: number;
	removeLinkBrackets: boolean;
	activeOnLaunch: boolean;
	compactMode: boolean;
	useAccentColor: boolean;
	showHoverEffect: boolean;
	folderIconStyle: FolderIconStyle;
}

const DEFAULT_DATA: FileTreePreviewData = {
	collapsedFolders: [],
	sortOrder: "name-asc",
	treeWidth: 300,
	previewLines: 4,
	removeLinkBrackets: true,
	activeOnLaunch: false,
	compactMode: false,
	useAccentColor: true,
	showHoverEffect: false,
	folderIconStyle: "custom"
};

interface IconizePlugin {
	data: Record<string, unknown>;
	api: {
		getIconByName: (name: string) => { svgElement: string } | null;
	};
}

export default class FileTreePreviewPlugin extends Plugin {
	data: FileTreePreviewData;

	async onload() {
		await this.loadPluginData();

		this.registerView(
			VIEW_TYPE_FILE_TREE_PREVIEW,
			(leaf) => new FileTreePreviewView(leaf, this)
		);

		this.addRibbonIcon("folder-tree", "File tree preview", () => {
			this.activateView().catch(console.error);
		});

		this.addCommand({
			id: "open",
			name: "Open",
			callback: () => {
				this.activateView().catch(console.error);
			}
		});

		this.addSettingTab(new FileTreePreviewSettingTab(this.app, this));

		// Activate view on launch if setting is enabled
		if (this.data.activeOnLaunch) {
			this.app.workspace.onLayoutReady(() => {
				this.activateView().catch(console.error);
			});
		}
	}

	onunload() {
		// Don't detach leaves - let user keep their layout
	}

	async loadPluginData() {
		const loadedData = await super.loadData() as Partial<FileTreePreviewData> & { showFolderIcons?: boolean } | null;
		this.data = Object.assign({}, DEFAULT_DATA, loadedData);

		// Migrate old showFolderIcons boolean to new folderIconStyle string
		if (loadedData && 'showFolderIcons' in loadedData) {
			this.data.folderIconStyle = loadedData.showFolderIcons ? "folder" : "none";
			await this.savePluginData();
		}
	}

	async savePluginData() {
		await super.saveData(this.data);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_FILE_TREE_PREVIEW, active: true });
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}
}

class FileTreePreviewView extends ItemView {
	private mainLayout: HTMLElement;
	private treeContainer: HTMLElement;
	private resizeHandle: HTMLElement;
	private previewContainer: HTMLElement;
	private previewHeader: HTMLElement;
	private previewContent: HTMLElement;
	private selectedFolder: TFolder | null = null;
	private activeFile: TFile | null = null;
	private plugin: FileTreePreviewPlugin;
	private collapsedFolders: Set<string>;
	private isResizing: boolean = false;
	private previewsCollapsed: boolean = false;
	private iconizeDataCache: string = "";
	private dragGhost: HTMLElement | null = null;
	private isRenderingTree: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: FileTreePreviewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.collapsedFolders = new Set(plugin.data.collapsedFolders);
	}

	getViewType(): string {
		return VIEW_TYPE_FILE_TREE_PREVIEW;
	}

	getDisplayText(): string {
		return "File tree preview";
	}

	getIcon(): string {
		return "folder-tree";
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();
		container.addClass("file-tree-preview-container");

		// Wait for Iconize plugin to be fully loaded
		await this.waitForIconizePlugin();

		// Create main layout with two columns
		this.mainLayout = container.createDiv({ cls: "ftp-main-layout" });

		// Apply compact mode if enabled
		if (this.plugin.data.compactMode) {
			this.mainLayout.addClass("ftp-compact");
		}

		// Apply highlight color preference
		if (!this.plugin.data.useAccentColor) {
			this.mainLayout.addClass("ftp-neutral-highlight");
		}

		// Detect if this is a touch device
		const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

		// Apply hover effect preference (but disable on touch devices)
		if (this.plugin.data.showHoverEffect && !isTouchDevice) {
			this.mainLayout.addClass("ftp-show-hover");
		}

		// Left column: file tree
		this.treeContainer = this.mainLayout.createDiv({ cls: "ftp-tree-column" });

		if (isTouchDevice) {
			// On touch devices, make both columns equal width
			this.treeContainer.addClass("ftp-touch-equal");
		} else {
			// On non-touch devices, use saved width and allow resizing
			this.treeContainer.setCssProps({ width: `${this.plugin.data.treeWidth}px` });
		}

		// Resize handle
		this.resizeHandle = this.mainLayout.createDiv({ cls: "ftp-resize-handle" });
		if (!isTouchDevice) {
			this.setupResizeHandle();
		} else {
			// Hide resize handle on touch devices
			this.resizeHandle.addClass("ftp-hidden");
		}

		// Right column: preview
		this.previewContainer = this.mainLayout.createDiv({ cls: "ftp-preview-column" });

		// Preview header
		this.previewHeader = this.previewContainer.createDiv({ cls: "ftp-preview-header" });

		// Preview content area
		this.previewContent = this.previewContainer.createDiv({ cls: "ftp-preview-content" });

		await this.renderFileTree();
		await this.renderPreview();

		// Re-render after a delay to catch any icons that weren't ready on first render
		this.register(() => {
			const timeoutId = window.setTimeout(() => {
				this.renderFileTree().catch(console.error);
			}, 1000);
			return () => window.clearTimeout(timeoutId);
		});

		// Listen for file changes
		this.registerEvent(
			this.app.vault.on("create", () => {
				this.renderFileTree().catch(console.error);
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.renderFileTree().catch(console.error);
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", () => {
				this.renderFileTree().catch(console.error);
				this.renderPreview().catch(console.error);
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file && file.parent) {
					const previousFolder = this.selectedFolder;
					this.activeFile = file;
					this.selectedFolder = file.parent;

					// If we're staying in the same folder, just update highlights
					if (previousFolder === this.selectedFolder) {
						this.updateActiveHighlight();
					} else {
						// Different folder, need to re-render
						Promise.all([
							this.renderFileTree(),
							this.renderPreview()
						]).catch(console.error);
					}
				}
			})
		);

		// Poll for Iconize data changes
		this.startIconizeDataPolling();
	}

	async onClose() {
		// Clean up
	}

	private async waitForIconizePlugin() {
		// Wait for Iconize plugin to be fully loaded (max 5 seconds)
		const maxWaitTime = 5000;
		const checkInterval = 100;
		let waited = 0;

		while (waited < maxWaitTime) {
			const iconFolderPlugin = (this.app as App & { plugins?: { plugins?: Record<string, IconizePlugin> } }).plugins?.plugins?.['obsidian-icon-folder'];
			if (iconFolderPlugin?.data && iconFolderPlugin?.api) {
				// Plugin is loaded
				return;
			}
			await new Promise(resolve => setTimeout(resolve, checkInterval));
			waited += checkInterval;
		}
		// Continue anyway after timeout
	}

	private startIconizeDataPolling() {
		// Check for Iconize data changes every 500ms
		const intervalId = window.setInterval(() => {
			try {
				const iconFolderPlugin = (this.app as App & { plugins?: { plugins?: Record<string, IconizePlugin> } }).plugins?.plugins?.['obsidian-icon-folder'];
				if (iconFolderPlugin?.data) {
					// Create a snapshot of current icon data (excluding settings)
					const currentData = JSON.stringify(
						Object.entries(iconFolderPlugin.data)
							.filter(([key]) => key !== 'settings')
							.sort()
					);

					// Check if data has changed
					if (this.iconizeDataCache && currentData !== this.iconizeDataCache) {
						this.iconizeDataCache = currentData;
						this.renderFileTree().catch(console.error);
					} else if (!this.iconizeDataCache) {
						// Initialize cache
						this.iconizeDataCache = currentData;
					}
				}
			} catch {
				// Silently fail
			}
		}, 500);

		// Clean up interval on view close
		this.register(() => window.clearInterval(intervalId));
	}

	setCompactMode(enabled: boolean) {
		if (enabled) {
			this.mainLayout.addClass("ftp-compact");
		} else {
			this.mainLayout.removeClass("ftp-compact");
		}
	}

	setHighlightColor(useAccent: boolean) {
		if (useAccent) {
			this.mainLayout.removeClass("ftp-neutral-highlight");
		} else {
			this.mainLayout.addClass("ftp-neutral-highlight");
		}
	}

	setHoverEffect(enabled: boolean) {
		if (enabled) {
			this.mainLayout.addClass("ftp-show-hover");
		} else {
			this.mainLayout.removeClass("ftp-show-hover");
		}
	}

	updateActiveHighlight() {
		// Update highlight classes without re-rendering
		const allCards = this.previewContent.querySelectorAll('.ftp-preview-item');
		allCards.forEach((card) => {
			const filename = card.querySelector('.ftp-preview-filename strong')?.textContent;
			if (filename === this.activeFile?.basename) {
				card.addClass('ftp-preview-item-active');
			} else {
				card.removeClass('ftp-preview-item-active');
			}
		});
	}

	private getFolderIcon(folder: TFolder): { type: 'emoji' | 'icon', value: string } | null {
		// Try to get custom folder icon from Iconize plugin (obsidian-icon-folder)
		try {
			const iconFolderPlugin = (this.app as App & { plugins?: { plugins?: Record<string, IconizePlugin> } }).plugins?.plugins?.['obsidian-icon-folder'];
			if (iconFolderPlugin) {
				// Access the plugin's data which stores folder path -> icon mappings
				const iconData = iconFolderPlugin.data;

				if (iconData && iconData[folder.path]) {
					const iconValue = iconData[folder.path] as string;

					// Check if it's an emoji or an icon identifier
					if (/[\p{Emoji}]/u.test(iconValue)) {
						return { type: 'emoji', value: iconValue };
					} else {
						// It's an icon identifier
						return { type: 'icon', value: iconValue };
					}
				}
			}
		} catch {
			// Silently fail if plugin not available
		}
		return null;
	}

	private isDescendantOf(possibleDescendant: TFolder, possibleAncestor: TFolder): boolean {
		// Check if possibleDescendant is a child or descendant of possibleAncestor
		let current: TFolder | null = possibleDescendant;

		while (current) {
			if (current === possibleAncestor) {
				return true;
			}
			current = current.parent;
		}

		return false;
	}

	private setupResizeHandle() {
		const handleMouseDown = (e: MouseEvent) => {
			this.isResizing = true;
			e.preventDefault();
			document.body.setCssProps({ cursor: 'col-resize' });
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (!this.isResizing) return;

			const containerRect = this.mainLayout.getBoundingClientRect();
			const newWidth = e.clientX - containerRect.left;

			// Constrain width between 150px and 80% of container width
			const minWidth = 150;
			const maxWidth = containerRect.width * 0.8;
			const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

			this.treeContainer.setCssProps({ width: `${clampedWidth}px` });
			this.plugin.data.treeWidth = clampedWidth;
		};

		const handleMouseUp = () => {
			if (this.isResizing) {
				this.isResizing = false;
				document.body.setCssProps({ cursor: '' });
				this.plugin.savePluginData().catch(console.error);
			}
		};

		this.resizeHandle.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		// Clean up on close
		this.register(() => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		});
	}

	async renderFileTree() {
		// Prevent concurrent renders that can cause duplicates
		if (this.isRenderingTree) {
			return;
		}

		this.isRenderingTree = true;
		try {
			this.treeContainer.empty();
			const root = this.app.vault.getRoot();
			await this.renderFolder(root, this.treeContainer, 0);
		} finally {
			this.isRenderingTree = false;
		}
	}

	private async renderFolder(folder: TFolder, container: HTMLElement, level: number) {
		// Get only folders, sorted alphabetically
		const folders = folder.children
			.filter((item): item is TFolder => item instanceof TFolder)
			.sort((a, b) => a.name.localeCompare(b.name));

		for (const item of folders) {
			const isSelected = this.selectedFolder === item;
			const hasSubfolders = item.children.some(child => child instanceof TFolder);
			const isCollapsed = this.collapsedFolders.has(item.path);

			const folderEl = container.createDiv({ cls: "ftp-folder-item" });
			folderEl.setCssProps({ 'padding-left': `calc(var(--ftp-folder-indent) * ${level})` });

			const folderHeader = folderEl.createDiv({
				cls: "ftp-folder-header" + (isSelected ? " ftp-selected" : "")
			});

			// Add caret if folder has subfolders
			if (hasSubfolders) {
				const caret = folderHeader.createSpan({ cls: "ftp-folder-caret" });
				// Use Obsidian's setIcon helper
				setIcon(caret, "right-triangle");

				// Apply collapsed state to caret
				if (isCollapsed) {
					caret.addClass("ftp-collapsed");
				}

				// Toggle collapse on caret click
				caret.addEventListener("click", (e) => {
					e.stopPropagation();
					const willBeCollapsed = !folderContent.hasClass("ftp-collapsed");
					folderContent.toggleClass("ftp-collapsed", willBeCollapsed);
					caret.toggleClass("ftp-collapsed", willBeCollapsed);

					// Update collapsed state and save
					if (willBeCollapsed) {
						this.collapsedFolders.add(item.path);
					} else {
						this.collapsedFolders.delete(item.path);
					}
					this.plugin.data.collapsedFolders = Array.from(this.collapsedFolders);
					this.plugin.savePluginData().catch(console.error);
				});
			} else {
				// Add spacer for alignment when no caret
				folderHeader.createSpan({ cls: "ftp-folder-caret-spacer" });
			}

			// Determine folder icon based on preference
			const iconStyle = this.plugin.data.folderIconStyle;
			const folderNameSpan = folderHeader.createSpan({ cls: "ftp-folder-name" });

			if (iconStyle === "none") {
				folderNameSpan.setText(item.name);
			} else if (iconStyle === "custom") {
				// Try to get custom icon from folder properties
				const customIcon = this.getFolderIcon(item);
				// Default icon: TiFolder for folders without subfolders, LiFolders for folders with subfolders
				const defaultIcon = hasSubfolders ? "LiFolders" : "TiFolder";
				const iconToRender = customIcon ? customIcon.value : defaultIcon;

				if (customIcon?.type === 'emoji') {
					// Simple emoji - just add as text
					folderNameSpan.setText(customIcon.value + " " + item.name);
				} else {
					// Icon identifier - use Iconize plugin to render it
					try {
						const iconFolderPlugin = (this.app as App & { plugins?: { plugins?: Record<string, IconizePlugin> } }).plugins?.plugins?.['obsidian-icon-folder'];

						if (iconFolderPlugin?.api?.getIconByName) {
							// Try to get the icon element from Iconize
							const iconData = iconFolderPlugin.api.getIconByName(iconToRender);

							if (iconData && iconData.svgElement) {
								// Create a container for the icon
								const iconContainer = folderNameSpan.createSpan({ cls: "ftp-icon-container" });
								// Use DOM parser to safely insert SVG
								const parser = new DOMParser();
								const doc = parser.parseFromString(iconData.svgElement, 'image/svg+xml');
								const svgEl = doc.documentElement;
								if (svgEl && !svgEl.querySelector('parsererror')) {
									iconContainer.appendChild(svgEl);
								}

								// Add the folder name after the icon
								folderNameSpan.appendText(" " + item.name);
							} else {
								// If icon not found, try default folder icon based on collapsed state
								const fallbackIcon = iconFolderPlugin.api.getIconByName(defaultIcon);
								if (fallbackIcon && fallbackIcon.svgElement) {
									const iconContainer = folderNameSpan.createSpan({ cls: "ftp-icon-container" });
									// Use DOM parser to safely insert SVG
									const parser = new DOMParser();
									const doc = parser.parseFromString(fallbackIcon.svgElement, 'image/svg+xml');
									const svgEl = doc.documentElement;
									if (svgEl && !svgEl.querySelector('parsererror')) {
										iconContainer.appendChild(svgEl);
									}
									folderNameSpan.appendText(" " + item.name);
								} else {
									// Last resort - no icon
									folderNameSpan.setText(item.name);
								}
							}
						} else {
							folderNameSpan.setText(item.name);
						}
					} catch (error) {
						console.error("Error rendering icon:", error);
						folderNameSpan.setText(item.name);
					}
				}
			} else if (iconStyle === "folder") {
				folderNameSpan.setText("📁 " + item.name);
			}

			const folderContent = container.createDiv({ cls: "ftp-folder-content" });

			// Apply collapsed state to content
			if (isCollapsed) {
				folderContent.addClass("ftp-collapsed");
			}

			// Make folder draggable
			folderHeader.setAttribute("draggable", "true");
			folderHeader.addEventListener("dragstart", (e) => {
				e.stopPropagation();
				e.dataTransfer?.setData("text/plain", item.path);
				e.dataTransfer?.setData("application/x-obsidian-folder", "true");
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = "move";
				}

				// Create custom drag ghost - just folder name in a pill
				this.dragGhost = document.body.createDiv({ cls: "ftp-drag-ghost" });
				this.dragGhost.setText(item.name);

				// Get the computed accent color and make it 50% transparent
				const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim();
				this.dragGhost.setCssProps({
					position: "fixed",
					left: "-9999px",
					top: "0",
					backgroundColor: `color-mix(in srgb, ${accentColor} 50%, transparent)`,
					color: getComputedStyle(document.body).getPropertyValue('--text-on-accent').trim()
				});

				// Set the custom drag image
				if (e.dataTransfer) {
					e.dataTransfer.setDragImage(this.dragGhost, 50, 15);
				}

				folderHeader.addClass("ftp-dragging");
			});

			folderHeader.addEventListener("dragend", () => {
				folderHeader.removeClass("ftp-dragging");

				// Clean up the drag ghost
				if (this.dragGhost) {
					this.dragGhost.remove();
					this.dragGhost = null;
				}
			});

			// Click on folder name to select (but not collapse)
			folderHeader.addEventListener("click", () => {
				this.selectedFolder = item;
				Promise.all([
					this.renderFileTree(),
					this.renderPreview()
				]).catch(console.error);
			});

			// Right-click context menu for folders
			folderHeader.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const menu = new Menu();

				// Add "New file" option
				menu.addItem((menuItem) => {
					menuItem
						.setTitle("New file")
						.setIcon("document")
						.onClick(() => {
							const createFile = async () => {
								const fileName = "Untitled.md";
								let filePath = `${item.path}/${fileName}`;
								let counter = 1;

								// Handle naming conflicts
								while (await this.app.vault.adapter.exists(filePath)) {
									filePath = `${item.path}/Untitled ${counter}.md`;
									counter++;
								}

								const file = await this.app.vault.create(filePath, "");
								await this.app.workspace.getLeaf(false).openFile(file);
							};
							createFile().catch(console.error);
						});
				});

				// Add "New folder" option
				menu.addItem((menuItem) => {
					menuItem
						.setTitle("New folder")
						.setIcon("folder")
						.onClick(() => {
							const createFolder = async () => {
								const folderName = "New folder";
								let folderPath = `${item.path}/${folderName}`;
								let counter = 1;

								// Handle naming conflicts
								while (await this.app.vault.adapter.exists(folderPath)) {
									folderPath = `${item.path}/New folder ${counter}`;
									counter++;
								}

								await this.app.vault.createFolder(folderPath);
							};
							createFolder().catch(console.error);
						});
				});

				menu.addSeparator();

				// Add "Rename" option
				menu.addItem((menuItem) => {
					menuItem
						.setTitle("Rename")
						.setIcon("pencil")
						.onClick(() => {
							new RenameModal(this.app, item.name, (newName) => {
								const renameFolder = async () => {
									if (newName !== item.name) {
										const parentPath = item.parent ? item.parent.path : "";
										const newPath = parentPath ? `${parentPath}/${newName}` : newName;
										try {
											await this.app.vault.rename(item, newPath);
										} catch (error) {
											console.error("Failed to rename folder:", error);
										}
									}
								};
								renameFolder().catch(console.error);
							}).open();
						});
				});

				// Add "Delete" option
				menu.addItem((menuItem) => {
					menuItem
						.setTitle("Delete")
						.setIcon("trash")
						.onClick(() => {
							new DeleteFolderModal(this.app, item.name, () => {
								const deleteFolder = async () => {
									try {
										await this.app.fileManager.trashFile(item);
									} catch (error) {
										console.error("Failed to delete folder:", error);
										new Notice("Failed to delete folder");
									}
								};
								deleteFolder().catch(console.error);
							}).open();
						});
				});

				menu.addSeparator();

				// Add standard Obsidian file menu options
				this.app.workspace.trigger("file-menu", menu, item, "file-explorer");
				menu.showAtMouseEvent(e);
			});

			// Drag and drop handlers - make folder a drop zone
			folderHeader.addEventListener("dragover", (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = "move";
				}
				folderHeader.addClass("ftp-drop-target");
			});

			folderHeader.addEventListener("dragleave", (e) => {
				e.preventDefault();
				e.stopPropagation();
				folderHeader.removeClass("ftp-drop-target");
			});

			folderHeader.addEventListener("drop", (e) => {
				e.preventDefault();
				e.stopPropagation();
				folderHeader.removeClass("ftp-drop-target");

				const draggedPath = e.dataTransfer?.getData("text/plain");
				if (!draggedPath) return;

				const draggedItem = this.app.vault.getAbstractFileByPath(draggedPath);
				if (!draggedItem) return;

				const isFolder = e.dataTransfer?.getData("application/x-obsidian-folder") === "true";

				const handleDrop = async () => {
					// Handle folder drops
					if (isFolder && draggedItem instanceof TFolder) {
						// Can't move folder into itself
						if (draggedItem === item) {
							new Notice("Cannot move a folder into itself");
							return;
						}

						// Can't move folder into one of its descendants
						if (this.isDescendantOf(item, draggedItem)) {
							new Notice("Cannot move a folder into one of its subfolders");
							return;
						}

						// Don't move if already in this folder
						if (draggedItem.parent === item) {
							new Notice("Folder is already in this location");
							return;
						}

						// Move the folder
						const newPath = `${item.path}/${draggedItem.name}`;
						try {
							await this.app.vault.rename(draggedItem, newPath);
							// Vault rename event will trigger re-render automatically
						} catch (error) {
							console.error("Failed to move folder:", error);
							new Notice("Failed to move folder");
						}
					}
					// Handle file drops
					else if (draggedItem instanceof TFile) {
						// Don't move if already in this folder
						if (draggedItem.parent === item) {
							return; // Silent for files as it's obvious
						}

						// Move the file
						const newPath = `${item.path}/${draggedItem.name}`;
						try {
							await this.app.vault.rename(draggedItem, newPath);
							// Vault rename event will trigger re-render automatically
						} catch (error) {
							console.error("Failed to move file:", error);
							new Notice("Failed to move file");
						}
					}
				};

				handleDrop().catch(console.error);
			});

			await this.renderFolder(item, folderContent, level + 1);
		}
	}

	async renderPreview() {
		this.previewHeader.empty();
		this.previewContent.empty();

		if (!this.selectedFolder) {
			this.previewHeader.setText("");
			this.previewContent.createDiv({
				text: "Select a folder to preview its files",
				cls: "ftp-no-selection"
			});
			return;
		}

		// Create header layout
		const headerLeft = this.previewHeader.createDiv({ cls: "ftp-preview-header-left" });
		headerLeft.setText(this.selectedFolder.name);

		const headerRight = this.previewHeader.createDiv({ cls: "ftp-preview-header-right" });

		// Add sort menu button
		const sortButton = headerRight.createEl("button", {
			cls: "ftp-header-button",
			attr: { "aria-label": "Sort files" }
		});
		sortButton.setText("⇅");

		sortButton.addEventListener("click", (e) => {
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("Name (a to z)")
					.setChecked(this.plugin.data.sortOrder === "name-asc")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "name-asc";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.addItem((item) => {
				item.setTitle("Name (z to a)")
					.setChecked(this.plugin.data.sortOrder === "name-desc")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "name-desc";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("Date modified (newest first)")
					.setChecked(this.plugin.data.sortOrder === "modified-new")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "modified-new";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.addItem((item) => {
				item.setTitle("Date modified (oldest first)")
					.setChecked(this.plugin.data.sortOrder === "modified-old")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "modified-old";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("Date created (newest first)")
					.setChecked(this.plugin.data.sortOrder === "created-new")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "created-new";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.addItem((item) => {
				item.setTitle("Date created (oldest first)")
					.setChecked(this.plugin.data.sortOrder === "created-old")
					.onClick(() => {
						const updateSort = async () => {
							this.plugin.data.sortOrder = "created-old";
							await this.plugin.savePluginData();
							await this.renderPreview();
						};
						updateSort().catch(console.error);
					});
			});

			menu.showAtMouseEvent(e);
		});

		// Add collapse preview button
		const collapseButton = headerRight.createEl("button", {
			cls: "ftp-header-button",
			attr: { "aria-label": "Collapse previews" }
		});
		collapseButton.setText(this.previewsCollapsed ? "⊕" : "⊖");

		collapseButton.addEventListener("click", () => {
			this.previewsCollapsed = !this.previewsCollapsed;
			collapseButton.setText(this.previewsCollapsed ? "⊕" : "⊖");
			collapseButton.setAttribute("aria-label", this.previewsCollapsed ? "Expand previews" : "Collapse previews");

			if (this.previewsCollapsed) {
				this.previewContent.addClass("ftp-previews-collapsed");
			} else {
				this.previewContent.removeClass("ftp-previews-collapsed");
			}
		});

		// Add new file button
		const newFileButton = headerRight.createEl("button", {
			cls: "ftp-header-button",
			attr: { "aria-label": "New file" }
		});
		newFileButton.setText("+");

		newFileButton.addEventListener("click", () => {
			if (this.selectedFolder) {
				const createFile = async () => {
					try {
						const fileName = "Untitled.md";
						let filePath = `${this.selectedFolder!.path}/${fileName}`;
						let counter = 1;

						// Handle naming conflicts
						while (await this.app.vault.adapter.exists(filePath)) {
							filePath = `${this.selectedFolder!.path}/Untitled ${counter}.md`;
							counter++;
						}

						const file = await this.app.vault.create(filePath, "");
						await this.app.workspace.getLeaf(false).openFile(file);
					} catch (error) {
						console.error("Error creating new file:", error);
						new Notice("Failed to create new file");
					}
				};
				createFile().catch(console.error);
			}
		});

		// Get all files in the selected folder (not subfolders)
		const files = this.selectedFolder.children.filter(
			(child): child is TFile => child instanceof TFile
		);

		if (files.length === 0) {
			this.previewContent.createDiv({
				text: "This folder contains no files",
				cls: "ftp-no-selection"
			});
			return;
		}

		// Sort files based on sort order
		this.sortFiles(files);

		// Create preview for each file
		for (const file of files) {
			await this.renderFilePreview(file);
		}
	}

	private sortFiles(files: TFile[]) {
		switch (this.plugin.data.sortOrder) {
			case "name-asc":
				files.sort((a, b) => a.basename.localeCompare(b.basename));
				break;
			case "name-desc":
				files.sort((a, b) => b.basename.localeCompare(a.basename));
				break;
			case "modified-new":
				files.sort((a, b) => b.stat.mtime - a.stat.mtime);
				break;
			case "modified-old":
				files.sort((a, b) => a.stat.mtime - b.stat.mtime);
				break;
			case "created-new":
				files.sort((a, b) => b.stat.ctime - a.stat.ctime);
				break;
			case "created-old":
				files.sort((a, b) => a.stat.ctime - b.stat.ctime);
				break;
		}
	}

	private getFileTypeInfo(file: TFile): { type: string; icon: string; label: string } | null {
		const ext = file.extension.toLowerCase();

		// Image files
		if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
			return { type: 'image', icon: '', label: '' };
		}

		// Canvas files
		if (ext === 'canvas') {
			return {
				type: 'placeholder',
				icon: `<svg viewBox="0 0 100 100" class="ftp-file-icon"><rect x="10" y="10" width="30" height="30" fill="currentColor" opacity="0.3"/><rect x="50" y="10" width="40" height="20" fill="currentColor" opacity="0.3"/><rect x="10" y="50" width="40" height="20" fill="currentColor" opacity="0.3"/><rect x="60" y="50" width="30" height="30" fill="currentColor" opacity="0.3"/></svg>`,
				label: 'Canvas'
			};
		}

		// Excalidraw files
		if (ext === 'excalidraw' || file.basename.endsWith('.excalidraw')) {
			return {
				type: 'placeholder',
				icon: `<svg viewBox="0 0 100 100" class="ftp-file-icon"><path d="M20,50 Q35,20 50,50 T80,50" stroke="currentColor" stroke-width="3" fill="none" opacity="0.5"/><circle cx="30" cy="70" r="8" fill="currentColor" opacity="0.3"/><rect x="55" y="25" width="25" height="20" fill="none" stroke="currentColor" stroke-width="2" opacity="0.4"/></svg>`,
				label: 'Excalidraw'
			};
		}

		// PDF files
		if (ext === 'pdf') {
			return {
				type: 'placeholder',
				icon: `<svg viewBox="0 0 100 100" class="ftp-file-icon"><rect x="20" y="10" width="50" height="70" rx="3" fill="none" stroke="currentColor" stroke-width="3" opacity="0.5"/><line x1="30" y1="30" x2="60" y2="30" stroke="currentColor" stroke-width="2" opacity="0.3"/><line x1="30" y1="45" x2="60" y2="45" stroke="currentColor" stroke-width="2" opacity="0.3"/><line x1="30" y1="60" x2="50" y2="60" stroke="currentColor" stroke-width="2" opacity="0.3"/></svg>`,
				label: 'PDF document'
			};
		}

		// Audio files
		if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext)) {
			return {
				type: 'placeholder',
				icon: `<svg viewBox="0 0 100 100" class="ftp-file-icon"><circle cx="35" cy="65" r="15" fill="none" stroke="currentColor" stroke-width="3" opacity="0.4"/><circle cx="65" cy="65" r="15" fill="none" stroke="currentColor" stroke-width="3" opacity="0.4"/><path d="M50,65 L50,25 L75,20 L75,60" stroke="currentColor" stroke-width="3" fill="none" opacity="0.5"/></svg>`,
				label: 'Audio file'
			};
		}

		// Video files
		if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv'].includes(ext)) {
			return {
				type: 'placeholder',
				icon: `<svg viewBox="0 0 100 100" class="ftp-file-icon"><rect x="15" y="25" width="55" height="50" rx="3" fill="none" stroke="currentColor" stroke-width="3" opacity="0.4"/><polygon points="40,45 40,65 60,55" fill="currentColor" opacity="0.5"/></svg>`,
				label: 'Video file'
			};
		}

		return null;
	}

	private async renderFilePreview(file: TFile) {
		const fileTypeInfo = this.getFileTypeInfo(file);

		// Highlight the currently active/open file
		const isActive = this.activeFile === file;
		const classes = "ftp-preview-item" + (isActive ? " ftp-preview-item-active" : "");

		const previewItem = this.previewContent.createDiv({ cls: classes });

		// Make preview card draggable
		previewItem.setAttribute("draggable", "true");
		previewItem.addEventListener("dragstart", (e) => {
			e.dataTransfer?.setData("text/plain", file.path);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = "move";
			}

			// Create custom drag ghost - just filename in a pill
			this.dragGhost = document.body.createDiv({ cls: "ftp-drag-ghost" });
			this.dragGhost.setText(file.basename);

			// Get the computed accent color and make it 50% transparent
			const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim();
			this.dragGhost.setCssProps({
				position: "fixed",
				left: "-9999px",
				top: "0",
				backgroundColor: `color-mix(in srgb, ${accentColor} 50%, transparent)`,
				color: getComputedStyle(document.body).getPropertyValue('--text-on-accent').trim()
			});

			// Set the custom drag image (centered)
			if (e.dataTransfer) {
				// Use a small offset to center the pill under the cursor
				e.dataTransfer.setDragImage(this.dragGhost, 50, 15);
			}

			previewItem.addClass("ftp-dragging");
		});
		previewItem.addEventListener("dragend", () => {
			previewItem.removeClass("ftp-dragging");

			// Clean up the drag ghost
			if (this.dragGhost) {
				this.dragGhost.remove();
				this.dragGhost = null;
			}
		});

		// Filename in bold
		const filename = previewItem.createDiv({ cls: "ftp-preview-filename" });
		filename.createEl("strong", { text: file.basename });

		if (fileTypeInfo?.type === 'image') {
			// Display thumbnail for image files
			const thumbnailContainer = previewItem.createDiv({ cls: "ftp-preview-thumbnail" });
			const img = thumbnailContainer.createEl("img");
			img.src = this.app.vault.getResourcePath(file);
			img.alt = file.basename;

			// Apply same height as text preview
			const lineCount = this.plugin.data.previewLines;
			thumbnailContainer.setCssProps({ height: `calc(1.4em * ${lineCount})` });
		} else if (fileTypeInfo?.type === 'placeholder') {
			// Display placeholder for special files
			const placeholderContainer = previewItem.createDiv({ cls: "ftp-preview-placeholder" });
			const iconContainer = placeholderContainer.createDiv({ cls: "ftp-placeholder-icon" });
			// Use DOM parser to safely insert SVG
			const parser = new DOMParser();
			const doc = parser.parseFromString(fileTypeInfo.icon, 'image/svg+xml');
			const svgEl = doc.documentElement;
			if (svgEl && !svgEl.querySelector('parsererror')) {
				iconContainer.appendChild(svgEl);
			}
			placeholderContainer.createDiv({ cls: "ftp-placeholder-label", text: fileTypeInfo.label });

			// Apply same height as text preview
			const lineCount = this.plugin.data.previewLines;
			placeholderContainer.setCssProps({ height: `calc(1.4em * ${lineCount})` });
		} else {
			// Read file content for text files
			const content = await this.app.vault.read(file);

			// Extract preview text (first few lines, excluding frontmatter)
			const previewText = this.extractPreviewText(content);

			// Preview lines
			const previewLines = previewItem.createDiv({ cls: "ftp-preview-lines" });
			previewLines.setText(previewText);

			// Apply dynamic line count from settings
			const lineCount = this.plugin.data.previewLines;
			previewLines.setCssProps({
				'-webkit-line-clamp': lineCount.toString(),
				height: `calc(1.4em * ${lineCount})`
			});
		}

		// Click to open
		previewItem.addEventListener("click", () => {
			const openFile = async () => {
				try {
					await this.app.workspace.getLeaf(false).openFile(file);
				} catch (error) {
					console.error("Error opening file:", error);
				}
			};
			openFile().catch(console.error);
		});

		// Right-click context menu for files
		previewItem.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			const menu = new Menu();

			// Add "New file" option (creates in same folder)
			menu.addItem((menuItem) => {
				menuItem
					.setTitle("New file")
					.setIcon("document")
					.onClick(() => {
						const createFile = async () => {
							const parentFolder = file.parent;
							if (!parentFolder) return;

							const fileName = "Untitled.md";
							let filePath = `${parentFolder.path}/${fileName}`;
							let counter = 1;

							// Handle naming conflicts
							while (await this.app.vault.adapter.exists(filePath)) {
								filePath = `${parentFolder.path}/Untitled ${counter}.md`;
								counter++;
							}

							const newFile = await this.app.vault.create(filePath, "");
							await this.app.workspace.getLeaf(false).openFile(newFile);
						};
						createFile().catch(console.error);
					});
			});

			// Add "New folder" option (creates in same folder)
			menu.addItem((menuItem) => {
				menuItem
					.setTitle("New folder")
					.setIcon("folder")
					.onClick(() => {
						const createFolder = async () => {
							const parentFolder = file.parent;
							if (!parentFolder) return;

							const folderName = "New folder";
							let folderPath = `${parentFolder.path}/${folderName}`;
							let counter = 1;

							// Handle naming conflicts
							while (await this.app.vault.adapter.exists(folderPath)) {
								folderPath = `${parentFolder.path}/New folder ${counter}`;
								counter++;
							}

							await this.app.vault.createFolder(folderPath);
						};
						createFolder().catch(console.error);
					});
			});

			menu.addSeparator();

			// Add "Rename" option
			menu.addItem((menuItem) => {
				menuItem
					.setTitle("Rename")
					.setIcon("pencil")
					.onClick(() => {
						new RenameModal(this.app, file.name, (newName) => {
							const renameFile = async () => {
								if (newName !== file.name) {
									const parentPath = file.parent ? file.parent.path : "";
									const newPath = parentPath ? `${parentPath}/${newName}` : newName;
									try {
										await this.app.vault.rename(file, newPath);
									} catch (error) {
										console.error("Failed to rename file:", error);
									}
								}
							};
							renameFile().catch(console.error);
						}).open();
					});
			});

			// Add "Duplicate" option
			menu.addItem((menuItem) => {
				menuItem
					.setTitle("Duplicate")
					.setIcon("copy")
					.onClick(() => {
						const duplicateFile = async () => {
							const parentFolder = file.parent;
							if (!parentFolder) return;

							// Read the original file content
							const content = await this.app.vault.read(file);

							// Create duplicate name
							const baseName = file.basename;
							const extension = file.extension;
							let duplicateName = `${baseName} copy`;
							let duplicatePath = `${parentFolder.path}/${duplicateName}.${extension}`;
							let counter = 1;

							// Handle naming conflicts
							while (await this.app.vault.adapter.exists(duplicatePath)) {
								duplicateName = `${baseName} copy ${counter}`;
								duplicatePath = `${parentFolder.path}/${duplicateName}.${extension}`;
								counter++;
							}

							// Create the duplicate file
							const newFile = await this.app.vault.create(duplicatePath, content);
							await this.app.workspace.getLeaf(false).openFile(newFile);

							// Refresh the preview panel to show the new file
							this.renderPreview().catch(console.error);
						};
						duplicateFile().catch(console.error);
					});
			});

			// Add "Delete" option
			menu.addItem((menuItem) => {
				menuItem
					.setTitle("Delete")
					.setIcon("trash")
					.onClick(() => {
						const deleteFile = async () => {
							try {
								await this.app.fileManager.trashFile(file);
								// Refresh the preview panel to remove the deleted file
								this.renderPreview().catch(console.error);
							} catch (error) {
								console.error("Failed to delete file:", error);
							}
						};
						deleteFile().catch(console.error);
					});
			});

			menu.addSeparator();

			// Add standard Obsidian file menu options
			this.app.workspace.trigger("file-menu", menu, file, "file-explorer");
			menu.showAtMouseEvent(e);
		});
	}

	private extractPreviewText(content: string): string {
		let text = content.trim();

		// Remove YAML frontmatter (between --- delimiters)
		if (text.startsWith("---")) {
			// Find the closing --- (must be on its own line)
			const lines = text.split("\n");
			let endIndex = -1;
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === "---") {
					endIndex = i;
					break;
				}
			}
			if (endIndex !== -1) {
				// Skip the frontmatter and rejoin remaining lines
				text = lines.slice(endIndex + 1).join("\n").trim();
			}
		}

		// Remove inline properties (key:: value format)
		text = text.replace(/^[\w-]+::.+$/gm, "");

		// Remove table separator lines (lines with only pipes, dashes, spaces)
		text = text.replace(/^\|?[\s|\-:]+\|?\s*$/gm, "");

		// Clean up markdown formatting for preview
		text = text
			.replace(/^#+\s/gm, "") // Remove headers
			.replace(/\*\*(.+?)\*\*/g, "$1") // Remove bold
			.replace(/\*(.+?)\*/g, "$1") // Remove italic
			.replace(/^[>\-*+]\s/gm, "") // Remove list markers and blockquotes
			.replace(/\|/g, " "); // Remove table pipes

		// Conditionally remove link brackets based on settings
		if (this.plugin.data.removeLinkBrackets) {
			text = text
				.replace(/\[\[(.+?)\]\]/g, "$1") // Remove wiki-links [[page]]
				.replace(/\[(.+?)\]\(.+?\)/g, "$1"); // Remove markdown links [text](url)
		}

		text = text.trim();

		// Join lines with space to create continuous text
		// CSS line-clamp will handle the truncation
		const lines = text.split("\n").filter(line => line.trim().length > 0);
		return lines.join(" ");
	}
}

class RenameModal extends Modal {
	private oldName: string;
	private onSubmit: (newName: string) => void;

	constructor(app: App, oldName: string, onSubmit: (newName: string) => void) {
		super(app);
		this.oldName = oldName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Rename" });

		const inputEl = contentEl.createEl("input", {
			type: "text",
			value: this.oldName,
			cls: "ftp-rename-input"
		});

		// Select the text without extension if it's a file
		const dotIndex = this.oldName.lastIndexOf('.');
		if (dotIndex > 0) {
			inputEl.setSelectionRange(0, dotIndex);
		} else {
			inputEl.select();
		}

		const buttonContainer = contentEl.createDiv({ cls: "ftp-button-container" });

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttonContainer.createEl("button", { text: "Rename", cls: "mod-cta" });
		submitButton.addEventListener("click", () => {
			const newName = inputEl.value.trim();
			if (newName && newName !== this.oldName) {
				this.onSubmit(newName);
			}
			this.close();
		});

		// Submit on Enter key
		inputEl.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				submitButton.click();
			}
		});

		inputEl.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DeleteFolderModal extends Modal {
	private folderName: string;
	private onConfirm: () => void;

	constructor(app: App, folderName: string, onConfirm: () => void) {
		super(app);
		this.folderName = folderName;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Delete folder" });

		const warningEl = contentEl.createDiv({ cls: "ftp-delete-warning" });

		warningEl.createEl("p", {
			text: `Are you sure you want to delete "${this.folderName}"?`
		});

		contentEl.createEl("p", {
			text: "This will delete the folder and all of its contents (files and subfolders). This action cannot be undone.",
			cls: "ftp-delete-detail"
		});

		const buttonContainer = contentEl.createDiv({ cls: "ftp-button-container" });
		buttonContainer.setCssProps({ marginTop: "20px" });

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());

		const deleteButton = buttonContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
		deleteButton.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});

		// Focus cancel button by default for safety
		cancelButton.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FileTreePreviewSettingTab extends PluginSettingTab {
	plugin: FileTreePreviewPlugin;

	constructor(app: App, plugin: FileTreePreviewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setHeading().setName('File tree preview settings');

		new Setting(containerEl)
			.setName('Active on launch')
			.setDesc('Automatically open the file tree preview when Obsidian starts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.data.activeOnLaunch)
				.onChange(async (value) => {
					this.plugin.data.activeOnLaunch = value;
					await this.plugin.savePluginData();
				}));

		new Setting(containerEl)
			.setName('Compact mode')
			.setDesc('Reduce spacing throughout for a denser view')
			.addToggle(toggle => toggle
				.setValue(this.plugin.data.compactMode)
				.onChange(async (value) => {
					this.plugin.data.compactMode = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.setCompactMode(value);
						}
					});
				}));

		new Setting(containerEl)
			.setName('Use accent color for active file')
			.setDesc('Highlight the active file with your accent color. When disabled, uses a neutral gray.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.data.useAccentColor)
				.onChange(async (value) => {
					this.plugin.data.useAccentColor = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.setHighlightColor(value);
						}
					});
				}));

		new Setting(containerEl)
			.setName('Show hover effect')
			.setDesc('Show background color when hovering over folders and preview cards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.data.showHoverEffect)
				.onChange(async (value) => {
					this.plugin.data.showHoverEffect = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.setHoverEffect(value);
						}
					});
				}));

		new Setting(containerEl)
			.setName('Folder icons')
			.setDesc('Choose how to display folder icons in the folder tree')
			.addDropdown(dropdown => dropdown
				.addOption('none', 'No icons')
				.addOption('custom', 'Custom icons')
				.addOption('folder', 'Folder emoji (📁)')
				.setValue(this.plugin.data.folderIconStyle)
				.onChange(async (value: FolderIconStyle) => {
					this.plugin.data.folderIconStyle = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.renderFileTree().catch(console.error);
						}
					});
				}));

		new Setting(containerEl)
			.setName('Preview lines')
			.setDesc('Number of lines to show in each file preview card (1-10)')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.data.previewLines)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.data.previewLines = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.renderPreview().catch(console.error);
						}
					});
				}));

		new Setting(containerEl)
			.setName('Remove link brackets')
			.setDesc('Remove brackets from wiki links ([[link]]) and markdown links ([text](url)) in preview text')
			.addToggle(toggle => toggle
				.setValue(this.plugin.data.removeLinkBrackets)
				.onChange(async (value) => {
					this.plugin.data.removeLinkBrackets = value;
					await this.plugin.savePluginData();
					// Refresh all open views
					this.app.workspace.getLeavesOfType(VIEW_TYPE_FILE_TREE_PREVIEW).forEach(leaf => {
						if (leaf.view instanceof FileTreePreviewView) {
							leaf.view.renderPreview().catch(console.error);
						}
					});
				}));

		// Ko-fi donation link
		const kofiContainer = containerEl.createDiv({ cls: 'ftp-kofi-container' });

		const kofiText = kofiContainer.createEl('p', {
			text: 'If you find this plugin helpful, consider ',
			cls: 'ftp-kofi-text'
		});

		const kofiLink = kofiText.createEl('a', {
			text: 'buying me a coffee',
			href: 'https://ko-fi.com/J3J61ODQ3A',
			cls: 'ftp-kofi-link'
		});
		kofiLink.setAttribute('target', '_blank');

		kofiText.appendText(' ☕');
	}
}
