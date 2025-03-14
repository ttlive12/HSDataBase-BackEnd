const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const { setupSecurity } = require('./utils/securityMiddleware');
// const { rebuildIndexes } = require('./models/deck');
// const { rebuildRankDetailsIndexes } = require('./models/rankDetails');
const cardService = require('./services/cardService');
const deckNameService = require('./services/deckNameService');
const scheduledTasks = require('./services/scheduledTasks');

const app = express();

// 连接 MongoDB 并初始化数据
mongoose.connect('mongodb://root:v4mmdtt7@cardmaster-test-mongodb.ns-ggr87o43.svc:27017')
// mongoose.connect('mongodb://root:rfjlptbk@cardmaster-mongodb.ns-ggr87o43.svc:27017')
    .then(async () => {
        console.log('MongoDB 连接成功');
        // await rebuildIndexes();
        // await rebuildRankDetailsIndexes();
        await cardService.initializeCards();
        await deckNameService.loadTranslations();

        // 启动定时任务
        scheduledTasks.startScheduledTasks();
    })
    .catch(err => console.error('MongoDB 连接失败:', err));

// 启用信任代理设置，允许app使用X-Forwarded-For头部识别客户端IP
app.set('trust proxy', true);

// 中间件配置
app.use(express.json());
app.use(morgan('dev'));

// 应用安全中间件
setupSecurity(app);

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