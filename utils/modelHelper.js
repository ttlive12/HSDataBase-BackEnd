const mongoose = require('mongoose');

// 用于缓存已创建的 Model
const modelCache = new Map();

function getModelForCollection(modelName, schema, isTemp = false, isWild = false) {
    // 将集合名称转换为小写
    const collectionName = `${modelName}${isWild ? '_wild' : ''}${isTemp ? '_temp' : ''}`.toLowerCase();
    
    // 使用缓存避免重复创建 Model
    const cacheKey = collectionName;
    if (!modelCache.has(cacheKey)) {
        modelCache.set(cacheKey, mongoose.model(collectionName, schema, collectionName));
    }
    
    return modelCache.get(cacheKey);
}

module.exports = {
    getModelForCollection
}; 