const mongoose = require('mongoose');

// 用于缓存已创建的 Model
const modelCache = new Map();

function getModelForCollection(modelName, schema, isTemp = false) {
    const collectionName = isTemp ? `${modelName.toLowerCase()}_temp` : modelName.toLowerCase();
    const cacheKey = `${modelName}${isTemp ? 'Temp' : ''}`;

    // 如果已经创建过这个 Model，直接返回缓存的实例
    if (modelCache.has(cacheKey)) {
        return modelCache.get(cacheKey);
    }

    // 创建新的 Model 并缓存
    try {
        const model = mongoose.model(cacheKey, schema, collectionName);
        modelCache.set(cacheKey, model);
        return model;
    } catch (error) {
        // 如果 Model 已经存在，获取已存在的 Model
        if (error.name === 'OverwriteModelError') {
            const model = mongoose.model(cacheKey);
            modelCache.set(cacheKey, model);
            return model;
        }
        throw error;
    }
}

module.exports = {
    getModelForCollection
}; 