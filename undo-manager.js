// Undo/Redo Manager with Command Pattern
class UndoManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 1000; // Unlimited in practice
        this.listeners = new Set();
    }

    // Execute a command and add to undo stack
    async execute(command) {
        try {
            // Execute the command
            await command.execute();
            
            // Add to undo stack
            this.undoStack.push(command);
            
            // Clear redo stack when new action is performed
            this.redoStack = [];
            
            // Limit stack size
            if (this.undoStack.length > this.maxHistorySize) {
                this.undoStack.shift();
            }
            
            // Save to IndexedDB for persistence
            await this.dbManager.addHistory({
                type: command.type,
                data: command.getData(),
                canUndo: true
            });
            
            this.notifyListeners();
            
            return true;
        } catch (error) {
            console.error('Command execution failed:', error);
            return false;
        }
    }

    // Undo last command
    async undo() {
        if (this.undoStack.length === 0) return false;
        
        try {
            const command = this.undoStack.pop();
            await command.undo();
            
            this.redoStack.push(command);
            this.notifyListeners();
            
            return true;
        } catch (error) {
            console.error('Undo failed:', error);
            // Put command back if undo failed
            this.undoStack.push(this.redoStack.pop());
            return false;
        }
    }

    // Redo last undone command
    async redo() {
        if (this.redoStack.length === 0) return false;
        
        try {
            const command = this.redoStack.pop();
            await command.execute();
            
            this.undoStack.push(command);
            this.notifyListeners();
            
            return true;
        } catch (error) {
            console.error('Redo failed:', error);
            // Put command back if redo failed
            this.redoStack.push(this.undoStack.pop());
            return false;
        }
    }

    // Check if undo is available
    canUndo() {
        return this.undoStack.length > 0;
    }

    // Check if redo is available
    canRedo() {
        return this.redoStack.length > 0;
    }

    // Get history info
    getHistoryInfo() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            totalChanges: this.undoStack.length
        };
    }

    // Clear all history
    async clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        await this.dbManager.clearHistory();
        this.notifyListeners();
    }

    // Add listener for history changes
    addListener(listener) {
        this.listeners.add(listener);
    }

    // Remove listener
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    // Notify listeners of history changes
    notifyListeners() {
        const info = this.getHistoryInfo();
        this.listeners.forEach(listener => {
            try {
                listener(info);
            } catch (error) {
                console.error('Error in undo manager listener:', error);
            }
        });
    }
}

// Command classes
class AddTaskCommand {
    constructor(taskManager, task) {
        this.taskManager = taskManager;
        this.task = task;
        this.type = 'add-task';
    }

    async execute() {
        await this.taskManager.addTaskDirect(this.task);
    }

    async undo() {
        await this.taskManager.deleteTaskDirect(this.task.id);
    }

    getData() {
        return { task: this.task };
    }
}

class DeleteTaskCommand {
    constructor(taskManager, task) {
        this.taskManager = taskManager;
        this.task = task;
        this.type = 'delete-task';
    }

    async execute() {
        await this.taskManager.deleteTaskDirect(this.task.id);
    }

    async undo() {
        await this.taskManager.addTaskDirect(this.task);
    }

    getData() {
        return { task: this.task };
    }
}

class ToggleTaskCommand {
    constructor(taskManager, task, newCompleted) {
        this.taskManager = taskManager;
        this.task = task;
        this.oldCompleted = task.completed;
        this.newCompleted = newCompleted;
        this.type = 'toggle-task';
    }

    async execute() {
        await this.taskManager.toggleTaskDirect(this.task.id, this.newCompleted);
    }

    async undo() {
        await this.taskManager.toggleTaskDirect(this.task.id, this.oldCompleted);
    }

    getData() {
        return { 
            taskId: this.task.id, 
            oldCompleted: this.oldCompleted,
            newCompleted: this.newCompleted 
        };
    }
}

class UpdateTaskCommand {
    constructor(taskManager, oldTask, newTask) {
        this.taskManager = taskManager;
        this.oldTask = { ...oldTask };
        this.newTask = { ...newTask };
        this.type = 'update-task';
    }

    async execute() {
        await this.taskManager.updateTaskDirect(this.newTask);
    }

    async undo() {
        await this.taskManager.updateTaskDirect(this.oldTask);
    }

    getData() {
        return { oldTask: this.oldTask, newTask: this.newTask };
    }
}

class BulkDeleteCommand {
    constructor(taskManager, tasks) {
        this.taskManager = taskManager;
        this.tasks = tasks;
        this.type = 'bulk-delete';
    }

    async execute() {
        for (const task of this.tasks) {
            await this.taskManager.deleteTaskDirect(task.id);
        }
    }

    async undo() {
        for (const task of this.tasks) {
            await this.taskManager.addTaskDirect(task);
        }
    }

    getData() {
        return { tasks: this.tasks };
    }
}
