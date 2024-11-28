const mongoose = require('mongoose');

// 检查集合是否存在的辅助函数
async function collectionExists(collectionName) {
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
}

// 集合切换功能
async function swapCollections() {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const collections = [
            { main: 'decks', temp: 'decks_temp' },
            { main: 'rankdatas', temp: 'rankdatas_temp' },
            { main: 'rankdetails', temp: 'rankdetails_temp' },
            { main: 'cardstats', temp: 'cardstats_temp' },
            { main: 'deckdetails', temp: 'deckdetails_temp' }
        ];

        for (const { main, temp } of collections) {
            // 检查临时集合是否存在
            const tempExists = await collectionExists(temp);
            if (!tempExists) {
                console.log(`临时集合 ${temp} 不存在，跳过切换`);
                continue;
            }

            // 如果主集合存在，重命名为备份
            const mainExists = await collectionExists(main);
            if (mainExists) {
                const backup = `${main}_backup`;
                // 如果已经存在备份，先删除
                const backupExists = await collectionExists(backup);
                if (backupExists) {
                    await mongoose.connection.db.collection(backup).drop();
                }
                await mongoose.connection.db.collection(main).rename(backup);
            }

            // 将临时集合重命名为主集合
            await mongoose.connection.db.collection(temp).rename(main);
            console.log(`成功切换集合: ${temp} -> ${main}`);
        }

        await session.commitTransaction();
        console.log('所有集合切换完成');
    } catch (error) {
        await session.abortTransaction();
        console.error('切换集合时出错:', error);
        throw error;
    } finally {
        session.endSession();
    }
}

// 清理临时集合功能
async function cleanupTempCollections() {
    try {
        const collections = [
            'decks_temp',
            'rankdatas_temp',
            'rankdetails_temp',
            'cardstats_temp',
            'deckdetails_temp'
        ];

        for (const collection of collections) {
            const exists = await collectionExists(collection);
            if (exists) {
                await mongoose.connection.db.collection(collection).drop();
                console.log(`清理临时集合: ${collection}`);
            }
        }
    } catch (error) {
        console.error('清理临时集合时出错:', error);
        throw error;
    }
}

module.exports = {
    swapCollections,
    cleanupTempCollections
}; 