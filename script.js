// Advanced Task Manager with all features
class TaskManager {
    constructor() {
        this.dbManager = null;
        this.syncManager = null;
        this.undoManager = null;
        this.tasks = [];
        this.filteredTasks = [];
        this.currentFilter = 'all';
        this.currentPriorityFilter = 'all';
        this.searchQuery = '';
        this.initialized = false;
    }

    async init() {
        // Initialize IndexedDB
        this.dbManager = new IndexedDBManager();
        await this.dbManager.init();

        // Initialize Sync Manager
        this.syncManager = new SyncManager(this.dbManager);
        this.syncManager.addListener(this.handleSyncEvent.bind(this));

        // Initialize Undo Manager
        this.undoManager = new UndoManager(this.dbManager);
        this.undoManager.addListener(this.handleHistoryChange.bind(this));

        // Load tasks from IndexedDB
        await this.loadTasks();

        this.initialized = true;
    }

    async loadTasks() {
        this.tasks = await this.dbManager.getAllTasks();
        this.applyFilters();
    }

    // Task operations with undo support
    async addTask(text, priority = 2) {
        const task = {
            id: Date.now(),
            text: text,
            completed: false,
            priority: priority,
            createdAt: Date.now(),
            modifiedAt: Date.now()
        };

        const command = new AddTaskCommand(this, task);
        await this.undoManager.execute(command);
        await this.syncManager.syncAction('add-task', task);
        
        await this.loadTasks();
        return task;
    }

    async deleteTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const command = new DeleteTaskCommand(this, task);
        await this.undoManager.execute(command);
        await this.syncManager.syncAction('delete-task', { id });
        
        await this.loadTasks();
    }

    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const command = new ToggleTaskCommand(this, task, !task.completed);
        await this.undoManager.execute(command);
        await this.syncManager.syncAction('toggle-task', { id, completed: !task.completed });
        
        await this.loadTasks();
    }

    // Direct operations (used by commands, no undo tracking)
    async addTaskDirect(task) {
        await this.dbManager.addTask(task);
    }

    async deleteTaskDirect(id) {
        await this.dbManager.deleteTask(id);
    }

    async toggleTaskDirect(id, completed) {
        const task = await this.dbManager.getTask(id);
        if (task) {
            task.completed = completed;
            task.modifiedAt = Date.now();
            await this.dbManager.updateTask(task);
        }
    }

    async updateTaskDirect(task) {
        task.modifiedAt = Date.now();
        await this.dbManager.updateTask(task);
    }

    // Filter and search
    setFilter(filter) {
        this.currentFilter = filter;
        this.applyFilters();
    }

    setPriorityFilter(priority) {
        this.currentPriorityFilter = priority;
        this.applyFilters();
    }

    setSearchQuery(query) {
        this.searchQuery = query.toLowerCase();
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.tasks];

        // Apply completion filter
        if (this.currentFilter === 'active') {
            filtered = filtered.filter(t => !t.completed);
        } else if (this.currentFilter === 'completed') {
            filtered = filtered.filter(t => t.completed);
        }

        // Apply priority filter
        if (this.currentPriorityFilter !== 'all') {
            filtered = filtered.filter(t => t.priority === parseInt(this.currentPriorityFilter));
        }

        // Apply search
        if (this.searchQuery) {
            filtered = filtered.filter(t => 
                t.text.toLowerCase().includes(this.searchQuery)
            );
        }

        this.filteredTasks = filtered;
    }

    getFilteredTasks() {
        return this.filteredTasks;
    }

    getRemainingCount() {
        return this.tasks.filter(t => !t.completed).length;
    }

    getTotalCount() {
        return this.tasks.length;
    }

    // Export/Import
    exportTasks() {
        const exportData = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            tasks: this.tasks,
            metadata: {
                totalTasks: this.tasks.length,
                completedTasks: this.tasks.filter(t => t.completed).length
            }
        };
        return JSON.stringify(exportData, null, 2);
    }

    async importTasks(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            // Validate format
            if (!data.tasks || !Array.isArray(data.tasks)) {
                throw new Error('Invalid import format');
            }

            // Validate each task
            const validTasks = data.tasks.filter(task => 
                task.id && task.text && typeof task.completed === 'boolean'
            );

            if (validTasks.length === 0) {
                throw new Error('No valid tasks found');
            }

            // Clear existing tasks
            await this.dbManager.clearAllTasks();

            // Import new tasks
            await this.dbManager.bulkAddTasks(validTasks);
            await this.loadTasks();

            return {
                success: true,
                imported: validTasks.length,
                skipped: data.tasks.length - validTasks.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Sync event handler
    handleSyncEvent(event) {
        if (event.type === 'sync-status-changed') {
            updateSyncStatusUI(event.status);
        } else if (event.type === 'conflict-resolved') {
            // Reload tasks after conflict resolution
            this.loadTasks();
        } else {
            // Handle task updates from other tabs
            this.loadTasks();
        }
    }

    // History change handler
    handleHistoryChange(info) {
        updateHistoryUI(info);
    }
}

// Global instance
let taskManager;

// DOM Elements
let taskInput, prioritySelect, addBtn, taskList, taskCounter;
let searchInput, undoBtn, redoBtn, exportBtn, importBtn, importFile;
let filterBtns, priorityFilterBtns, helpBtn, helpModal;
let syncStatus, offlineIndicator, historyInfo;

// Initialize app
async function initApp() {
    // Get DOM elements
    taskInput = document.getElementById('taskInput');
    prioritySelect = document.getElementById('prioritySelect');
    addBtn = document.getElementById('addBtn');
    taskList = document.getElementById('taskList');
    taskCounter = document.getElementById('taskCounter');
    searchInput = document.getElementById('searchInput');
    undoBtn = document.getElementById('undoBtn');
    redoBtn = document.getElementById('redoBtn');
    exportBtn = document.getElementById('exportBtn');
    importBtn = document.getElementById('importBtn');
    importFile = document.getElementById('importFile');
    filterBtns = document.querySelectorAll('.filter-btn');
    priorityFilterBtns = document.querySelectorAll('.priority-filter');
    helpBtn = document.getElementById('helpBtn');
    helpModal = document.getElementById('helpModal');
    syncStatus = document.getElementById('syncStatus');
    offlineIndicator = document.getElementById('offlineIndicator');
    historyInfo = document.getElementById('historyInfo');

    // Initialize task manager
    taskManager = new TaskManager();
    await taskManager.init();

    // Setup event listeners
    setupEventListeners();
    setupKeyboardShortcuts();

    // Initial render
    renderTasks();
    updateCounter();
    updateHistoryUI(taskManager.undoManager.getHistoryInfo());
}

function setupEventListeners() {
    // Add task
    addBtn.addEventListener('click', handleAddTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddTask();
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        taskManager.setSearchQuery(e.target.value);
        renderTasks();
    });

    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            taskManager.setFilter(btn.dataset.filter);
            renderTasks();
        });
    });

    priorityFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            priorityFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            taskManager.setPriorityFilter(btn.dataset.priority);
            renderTasks();
        });
    });

    // Undo/Redo
    undoBtn.addEventListener('click', async () => {
        await taskManager.undoManager.undo();
        await taskManager.loadTasks();
        renderTasks();
        updateCounter();
    });

    redoBtn.addEventListener('click', async () => {
        await taskManager.undoManager.redo();
        await taskManager.loadTasks();
        renderTasks();
        updateCounter();
    });

    // Export/Import
    exportBtn.addEventListener('click', handleExport);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleImport);

    // Help modal
    helpBtn.addEventListener('click', () => {
        helpModal.style.display = 'block';
    });

    const closeBtn = helpModal.querySelector('.close');
    closeBtn.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+N: New task
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            taskInput.focus();
        }
        // Ctrl+Z: Undo
        else if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            if (taskManager.undoManager.canUndo()) {
                undoBtn.click();
            }
        }
        // Ctrl+Y: Redo
        else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            if (taskManager.undoManager.canRedo()) {
                redoBtn.click();
            }
        }
        // Ctrl+F: Search
        else if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            searchInput.focus();
        }
        // Ctrl+1/2/3: Priority filters
        else if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
            e.preventDefault();
            const btn = document.querySelector(`[data-priority="${e.key}"]`);
            if (btn) btn.click();
        }
    });
}

async function handleAddTask() {
    const text = taskInput.value.trim();
    if (!text) {
        taskInput.focus();
        return;
    }

    const priority = parseInt(prioritySelect.value);
    await taskManager.addTask(text, priority);
    
    taskInput.value = '';
    prioritySelect.value = '2';
    taskInput.focus();
    
    renderTasks();
    updateCounter();
}

async function handleToggleTask(id) {
    await taskManager.toggleTask(id);
    renderTasks();
    updateCounter();
}

async function handleDeleteTask(id) {
    await taskManager.deleteTask(id);
    renderTasks();
    updateCounter();
}

function renderTasks() {
    const tasks = taskManager.getFilteredTasks();
    taskList.innerHTML = '';

    if (tasks.length === 0) {
        const emptyMsg = taskManager.searchQuery 
            ? 'No tasks match your search 🔍'
            : 'No tasks yet. Add one to get started! 🎯';
        taskList.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''} priority-${task.priority}`;
        li.setAttribute('data-id', task.id);

        const priorityIcon = task.priority === 1 ? '🔴' : task.priority === 2 ? '🟡' : '🟢';

        li.innerHTML = `
            <span class="priority-indicator" title="Priority: ${task.priority}">${priorityIcon}</span>
            <input type="checkbox" id="task-${task.id}" ${task.completed ? 'checked' : ''}>
            <label for="task-${task.id}">${escapeHtml(task.text)}</label>
            <button class="delete-btn">Delete</button>
        `;

        const checkbox = li.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => handleToggleTask(task.id));

        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            li.classList.add('removing');
            setTimeout(() => handleDeleteTask(task.id), 300);
        });

        taskList.appendChild(li);
    });
}

function updateCounter() {
    const remaining = taskManager.getRemainingCount();
    const total = taskManager.getTotalCount();

    if (total === 0) {
        taskCounter.textContent = 'No tasks';
    } else if (remaining === 0) {
        taskCounter.textContent = 'All tasks completed! 🎉';
    } else {
        taskCounter.textContent = `${remaining} task${remaining !== 1 ? 's' : ''} remaining`;
    }
}

function updateHistoryUI(info) {
    historyInfo.textContent = `History: ${info.totalChanges} changes`;
    undoBtn.disabled = !taskManager.undoManager.canUndo();
    redoBtn.disabled = !taskManager.undoManager.canRedo();
}

function updateSyncStatusUI(status) {
    const statusMap = {
        'synced': '✓ Synced',
        'pending': '⏳ Pending',
        'conflict': '⚠️ Conflict',
        'offline': '📡 Offline'
    };

    syncStatus.textContent = statusMap[status] || statusMap.synced;
    syncStatus.className = `sync-${status}`;

    if (status === 'offline') {
        offlineIndicator.style.display = 'inline';
    } else {
        offlineIndicator.style.display = 'none';
    }
}

function handleExport() {
    const data = taskManager.exportTasks();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const result = await taskManager.importTasks(text);

        if (result.success) {
            alert(`Successfully imported ${result.imported} tasks!${result.skipped > 0 ? `\n${result.skipped} tasks were skipped.` : ''}`);
            renderTasks();
            updateCounter();
        } else {
            alert(`Import failed: ${result.error}`);
        }
    } catch (error) {
        alert(`Import failed: ${error.message}`);
    }

    // Reset file input
    importFile.value = '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
