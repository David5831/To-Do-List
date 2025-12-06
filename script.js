// DOM Elements
const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');
const taskCounter = document.getElementById('taskCounter');

// Load tasks from localStorage on page load
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

// Initialize the app
function init() {
    renderTasks();
    updateCounter();
}

// Add task event listeners
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});

// Add a new task
function addTask() {
    const taskText = taskInput.value.trim();
    
    if (taskText === '') {
        taskInput.focus();
        return;
    }
    
    const task = {
        id: Date.now(),
        text: taskText,
        completed: false
    };
    
    tasks.push(task);
    saveTasks();
    renderTasks();
    updateCounter();
    
    // Clear input and focus
    taskInput.value = '';
    taskInput.focus();
}

// Toggle task completion
function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
        updateCounter();
    }
}

// Delete a task
function deleteTask(id) {
    const taskElement = document.querySelector(`[data-id="${id}"]`);
    
    // Add removing animation
    if (taskElement) {
        taskElement.classList.add('removing');
        
        // Wait for animation to complete before removing
        setTimeout(() => {
            tasks = tasks.filter(t => t.id !== id);
            saveTasks();
            renderTasks();
            updateCounter();
        }, 300);
    }
}

// Render all tasks
function renderTasks() {
    taskList.innerHTML = '';
    
    if (tasks.length === 0) {
        taskList.innerHTML = '<div class="empty-state">No tasks yet. Add one to get started! 🎯</div>';
        return;
    }
    
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.setAttribute('data-id', task.id);
        
        li.innerHTML = `
            <input type="checkbox" id="task-${task.id}" ${task.completed ? 'checked' : ''} 
                   onchange="toggleTask(${task.id})">
            <label for="task-${task.id}">${task.text}</label>
            <button class="delete-btn" onclick="deleteTask(${task.id})">Delete</button>
        `;
        
        taskList.appendChild(li);
    });
}

// Update the remaining tasks counter
function updateCounter() {
    const remainingTasks = tasks.filter(t => !t.completed).length;
    const totalTasks = tasks.length;
    
    if (totalTasks === 0) {
        taskCounter.textContent = 'No tasks';
    } else if (remainingTasks === 0) {
        taskCounter.textContent = 'All tasks completed! 🎉';
    } else if (remainingTasks === 1) {
        taskCounter.textContent = '1 task remaining';
    } else {
        taskCounter.textContent = `${remainingTasks} tasks remaining`;
    }
}

// Save tasks to localStorage
function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Initialize the app
init();
