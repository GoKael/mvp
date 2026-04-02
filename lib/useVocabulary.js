/**
 * Vocabulary Engine (The 'useVocabulary' Hook-like module)
 * Handles data synchronization, storage and logic for word statuses.
 */
export const useVocabulary = {
    vault: {},
    vaultArray: [],
    
    async init() {
        console.log('useVocabulary: Initializing...');
        try {
            // 1. Fetch baseline dictionary
            const response = await fetch(chrome.runtime.getURL('server/data/lr_8k.json'));
            const data = await response.json();
            
            // 2. Fetch user statuses
            const { vaultWordStatuses } = await chrome.storage.local.get(['vaultWordStatuses']);
            const statuses = vaultWordStatuses || {};
            
            // 3. Merge
            this.vault = {};
            this.vaultArray = Object.keys(data).map((word, index) => {
                const item = { 
                    ...data[word], 
                    word, 
                    rank: index + 1,
                    status: statuses[word] !== undefined ? statuses[word] : 0 
                };
                this.vault[word] = item;
                return item;
            });
            
            return this.vaultArray;
        } catch (e) {
            console.error('useVocabulary: Initialization failed', e);
            return [];
        }
    },

    async updateStatus(word, status) {
        if (!this.vault[word]) return;
        this.vault[word].status = status;
        
        // Persist
        const { vaultWordStatuses } = await chrome.storage.local.get(['vaultWordStatuses']);
        const statuses = vaultWordStatuses || {};
        statuses[word] = status;
        await chrome.storage.local.set({ vaultWordStatuses: statuses });
        
        // Track daily learning if status changed to Learn/Known
        if (status === 1 || status === 2) {
            await this.trackDaily(word);
        }
        
        return this.vault[word];
    },

    async trackDaily(word) {
        const today = new Date().toISOString().split('T')[0];
        const { dailyLearnedWords } = await chrome.storage.local.get(['dailyLearnedWords']);
        const data = dailyLearnedWords || {};
        
        if (!data[today]) data[today] = [];
        if (!data[today].includes(word)) {
            data[today].push(word);
            await chrome.storage.local.set({ dailyLearnedWords: data });
        }
    },

    async getStats() {
        const { dailyLearnedWords } = await chrome.storage.local.get(['dailyLearnedWords']);
        const stats = {
            known: 0,
            learn: 0,
            ignore: 0,
            todayCount: (dailyLearnedWords || {})[new Date().toISOString().split('T')[0]]?.length || 0,
            heatmap: dailyLearnedWords || {}
        };
        
        this.vaultArray.forEach(item => {
            if (item.status === 2) stats.known++;
            else if (item.status === 1) stats.learn++;
            else if (item.status === -1) stats.ignore++;
        });
        
        return stats;
    },

    async resetAll() {
        await chrome.storage.local.remove(['vaultWordStatuses', 'dailyLearnedWords']);
        await this.init();
        console.log('useVocabulary: All memory reset to zero.');
    }
};
