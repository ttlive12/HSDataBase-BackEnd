const { Translation } = require('../models/translation');

class DeckNameService {
    constructor() {
        this.translations = new Map();
        this.initialized = false;
    }

    /**
     * 从数据库加载翻译数据
     */
    async loadTranslations() {
        try {
            const translations = await Translation.find({});
            this.translations.clear();
            translations.forEach(t => {
                this.translations.set(t.englishName, t.chineseName);
            });
            this.initialized = true;
            console.log('翻译数据加载成功');
        } catch (error) {
            console.error('加载翻译数据时出错:', error);
            throw error;
        }
    }

    /**
     * 获取中文名称
     */
    async getChineseName(englishName) {
        if (!this.initialized) {
            await this.loadTranslations();
        }
        return this.translations.get(englishName) || englishName;
    }

    /**
     * 添加新的翻译
     */
    async addTranslation(englishName, chineseName) {
        try {
            await Translation.updateOne(
                { englishName },
                { $set: { chineseName } },
                { upsert: true }
            );
            await this.loadTranslations(); // 重新加载翻译数据
            return true;
        } catch (error) {
            console.error('添加翻译时出错:', error);
            throw error;
        }
    }
}

module.exports = new DeckNameService(); 