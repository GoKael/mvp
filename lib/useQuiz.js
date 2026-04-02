/**
 * Quiz Engine (The 'useQuiz' Hook-like module)
 * Manages learning session status and word selection algorithm.
 */
import { useVocabulary } from './useVocabulary.js';

export const useQuiz = {
    sessionPool: [],
    currentIndex: 0,
    sessionSize: 10,
    newItemsRatio: 0.5,
    levelRange: 8000,
    
    async generate(config = {}) {
        this.sessionSize = config.size || 10;
        this.newItemsRatio = (config.newRatio || 50) / 100;
        this.levelRange = config.range || 8000;
        
        await useVocabulary.init();
        const availableWords = useVocabulary.vaultArray.slice(0, this.levelRange);
        
        const known = availableWords.filter(w => w.status === 2);
        const learning = availableWords.filter(w => w.status === 1);
        const ignored = availableWords.filter(w => w.status === -1);
        const suggested = availableWords.filter(w => w.status === 0 || !w.status);
        
        // Pick words for the session
        const learnCount = Math.ceil(this.sessionSize * (1 - this.newItemsRatio));
        const newCount = this.sessionSize - learnCount;
        
        // 1. Pick from "Learning" words (prioritize overdue if timestamp exists, else random)
        const curPool = this.shuffle(learning).slice(0, learnCount);
        
        // 2. Add "New" suggested words
        const newPool = this.shuffle(suggested).slice(0, newCount);
        
        this.sessionPool = this.shuffle([...curPool, ...newPool]);
        this.currentIndex = 0;
        
        return this.sessionPool;
    },
    
    getCurrent() {
        if (this.currentIndex >= this.sessionPool.length) return null;
        return this.sessionPool[this.currentIndex];
    },
    
    async markCurrent(status) {
        const item = this.getCurrent();
        if (!item) return;
        
        await useVocabulary.updateStatus(item.word, status);
        this.currentIndex++;
        return item;
    },
    
    getProgress() {
        return {
            total: this.sessionPool.length,
            current: this.currentIndex + 1,
            percent: Math.min(100, (this.currentIndex / this.sessionPool.length) * 100)
        };
    },
    
    shuffle(array) {
        return array.sort(() => Math.random() - 0.5);
    },
    
    isComplete() {
        return this.currentIndex >= this.sessionPool.length;
    }
};
