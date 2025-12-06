// Sync Manager for multi-tab synchronization
class SyncManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.channel = null;
        this.syncStatus = 'synced'; // 'synced', 'pending', 'conflict'
        this.conflictResolver = null;
        this.listeners = new Set();
        this.isOnline = navigator.onLine;
        
        this.init();
    }

    init() {
        // Create BroadcastChannel for multi-tab sync
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel('task-sync-channel');
            this.channel.onmessage = (event) => this.handleMessage(event);
        }

        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateSyncStatus('synced');
            this.processSyncQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateSyncStatus('pending');
        });

        // Listen for Service Worker messages
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_COMPLETE') {
                    this.updateSyncStatus('synced');
                }
            });
        }

        // Periodic sync check
        setInterval(() => this.checkSyncStatus(), 30000);
    }

    // Broadcast changes to other tabs
    broadcast(message) {
        if (this.channel) {
            this.channel.postMessage({
                ...message,
                timestamp: Date.now(),
                tabId: this.getTabId()
            });
        }
    }

    // Handle messages from other tabs
    handleMessage(event) {
        const { type, data, timestamp, tabId } = event.data;

        // Ignore messages from this tab
        if (tabId === this.getTabId()) return;

        // Detect conflicts (same task modified in multiple tabs)
        const conflict = this.detectConflict(data, timestamp);
        
        if (conflict) {
            this.handleConflict(data, conflict);
        } else {
            // Notify listeners to update UI
            this.notifyListeners({ type, data, timestamp });
        }
    }

    // Detect conflicts in concurrent modifications
    detectConflict(incomingData, incomingTimestamp) {
        // Check if we have a pending change for the same task
        // This is a simple timestamp-based conflict detection
        // In production, use vector clocks or CRDTs
        const pendingChanges = this.getPendingChanges();
        
        for (const change of pendingChanges) {
            if (change.taskId === incomingData.id) {
                // Conflict detected
                return {
                    local: change,
                    remote: { data: incomingData, timestamp: incomingTimestamp }
                };
            }
        }
        
        return null;
    }

    // Handle sync conflicts
    handleConflict(remoteData, conflict) {
        this.updateSyncStatus('conflict');
        
        // Default resolution: Last-Write-Wins (LWW)
        if (this.conflictResolver) {
            this.conflictResolver(conflict);
        } else {
            // Use LWW by default
            const useRemote = conflict.remote.timestamp > conflict.local.timestamp;
            
            if (useRemote) {
                this.notifyListeners({ 
                    type: 'conflict-resolved', 
                    data: remoteData,
                    resolution: 'remote-wins'
                });
            }
            
            // Log conflict for debugging
            console.warn('Sync conflict detected and resolved:', {
                local: conflict.local,
                remote: conflict.remote,
                resolution: useRemote ? 'remote-wins' : 'local-wins'
            });
        }
    }

    // Set custom conflict resolver
    setConflictResolver(resolver) {
        this.conflictResolver = resolver;
    }

    // Update sync status
    updateSyncStatus(status) {
        this.syncStatus = status;
        this.notifyListeners({ type: 'sync-status-changed', status });
    }

    // Get current sync status
    getSyncStatus() {
        if (!this.isOnline) return 'offline';
        return this.syncStatus;
    }

    // Add listener for sync events
    addListener(listener) {
        this.listeners.add(listener);
    }

    // Remove listener
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    // Notify all listeners
    notifyListeners(event) {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in sync listener:', error);
            }
        });
    }

    // Process offline sync queue
    async processSyncQueue() {
        if (!this.isOnline) return;

        try {
            const pendingItems = await this.dbManager.getPendingSyncItems();
            
            if (pendingItems.length === 0) {
                this.updateSyncStatus('synced');
                return;
            }

            this.updateSyncStatus('pending');

            // Process each pending item
            for (const item of pendingItems) {
                try {
                    // In a real app, this would sync with a backend server
                    // For now, just mark as synced
                    await this.dbManager.markSynced(item.id);
                } catch (error) {
                    console.error('Failed to sync item:', item, error);
                }
            }

            // Clean up synced items
            await this.dbManager.clearSyncedItems();
            this.updateSyncStatus('synced');
            
        } catch (error) {
            console.error('Error processing sync queue:', error);
            this.updateSyncStatus('conflict');
        }
    }

    // Check sync status periodically
    async checkSyncStatus() {
        const pendingItems = await this.dbManager.getPendingSyncItems();
        
        if (pendingItems.length > 0 && this.isOnline) {
            this.processSyncQueue();
        }
    }

    // Get pending changes (in-memory tracking)
    getPendingChanges() {
        // This would typically track recent local changes
        // For simplicity, return empty array
        return [];
    }

    // Generate unique tab ID
    getTabId() {
        if (!this._tabId) {
            this._tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        return this._tabId;
    }

    // Sync a specific action
    async syncAction(action, data) {
        // Add to sync queue if offline
        if (!this.isOnline) {
            await this.dbManager.addToSyncQueue({ action, data });
            this.updateSyncStatus('pending');
            return;
        }

        // Broadcast to other tabs
        this.broadcast({ type: action, data });

        // In production, also sync with backend server
        // await this.syncWithServer(action, data);
    }

    // Clean up
    destroy() {
        if (this.channel) {
            this.channel.close();
        }
        this.listeners.clear();
    }
}
