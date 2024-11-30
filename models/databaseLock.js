const mongoose = require('mongoose');

// 检查集合是否存在的辅助函数
async function collectionExists(collectionName) {
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
}

// 获取集合名称列表
function getCollectionNames(isWild = false) {
    const wildSuffix = isWild ? '_wild' : '';
    return [
        { main: `decks${wildSuffix}`, temp: `decks${wildSuffix}_temp` },
        { main: `rankdatas${wildSuffix}`, temp: `rankdatas${wildSuffix}_temp` },
        { main: `rankdetails${wildSuffix}`, temp: `rankdetails${wildSuffix}_temp` },
        { main: `cardstats${wildSuffix}`, temp: `cardstats${wildSuffix}_temp` },
        { main: `deckdetails${wildSuffix}`, temp: `deckdetails${wildSuffix}_temp` }
    ];
}

// 集合切换功能
async function swapCollections(isWild = false) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const collections = getCollectionNames(isWild);
        const mode = isWild ? '狂野' : '标准';
        console.log(`开始切换${mode}模式集合...`);

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
        console.log(`${mode}模式所有集合切换完成`);
    } catch (error) {
        await session.abortTransaction();
        console.error(`切换${isWild ? '狂野' : '标准'}模式集合时出错:`, error);
        throw error;
    } finally {
        session.endSession();
    }
}

// 清理临时集合功能
async function cleanupTempCollections(isWild = false) {
    try {
        const collections = getCollectionNames(isWild);
        const mode = isWild ? '狂野' : '标准';
        console.log(`开始清理${mode}模式临时集合...`);

        for (const { temp } of collections) {
            const exists = await collectionExists(temp);
            if (exists) {
                await mongoose.connection.db.collection(temp).drop();
                console.log(`清理临时集合: ${temp}`);
            }
        }
        
        console.log(`${mode}模式临时集合清理完成`);
    } catch (error) {
        console.error(`清理${isWild ? '狂野' : '标准'}模式临时集合时出错:`, error);
        throw error;
    }
}

module.exports = {
    swapCollections,
    cleanupTempCollections
}; 