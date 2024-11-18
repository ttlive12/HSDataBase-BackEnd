const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const { rebuildIndexes } = require('./models/deck');
const cardService = require('./services/cardService');
const deckNameService = require('./services/deckNameService');

const app = express();

// 连接 MongoDB 并初始化数据
mongoose.connect('mongodb://root:jlqcr7ww@hs-db-mongodb.ns-xemi33i0.svc:27017', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('MongoDB 连接成功');
    await rebuildIndexes();
    await cardService.initializeCards();
    await deckNameService.loadTranslations(); // 加载翻译数据
})
.catch(err => console.error('MongoDB 连接失败:', err));

// 中间件配置
app.use(express.json());
app.use(morgan('dev'));

// 路由配置
app.use('/', apiRoutes);

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: '服务器内部错误',
        error: err.message
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
}); 