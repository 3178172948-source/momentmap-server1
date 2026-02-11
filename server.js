const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // 存储所有连接的用户
let bubbles = []; // 存储所有气泡

// 首页路由
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>此刻地图服务器</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
        }
        .container {
          text-align: center;
          padding: 40px;
          background: rgba(255,255,255,0.15);
          border-radius: 20px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          max-width: 500px;
          width: 100%;
        }
        h1 { 
          font-size: 36px; 
          margin-bottom: 10px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .subtitle {
          font-size: 16px;
          opacity: 0.9;
          margin-bottom: 30px;
        }
        .status { 
          font-size: 20px; 
          color: #4ade80;
          margin-bottom: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .pulse {
          width: 12px;
          height: 12px;
          background: #4ade80;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin: 30px 0;
        }
        .stat-box {
          background: rgba(255,255,255,0.1);
          padding: 20px;
          border-radius: 15px;
        }
        .stat-number {
          font-size: 48px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .stat-label {
          font-size: 14px;
          opacity: 0.8;
        }
        .info {
          margin-top: 30px;
          padding: 20px;
          background: rgba(0,0,0,0.2);
          border-radius: 15px;
          font-size: 13px;
          line-height: 1.8;
          text-align: left;
        }
        .info-item {
          margin-bottom: 10px;
          word-break: break-all;
        }
        .label {
          color: #fbbf24;
          font-weight: bold;
        }
        @media (max-width: 600px) {
          h1 { font-size: 28px; }
          .stats { grid-template-columns: 1fr; }
          .stat-number { font-size: 36px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🗺️ 此刻地图</h1>
        <div class="subtitle">MomentMap Server</div>
        
        <div class="status">
          <div class="pulse"></div>
          <span>服务器运行中</span>
        </div>
        
        <div class="stats">
          <div class="stat-box">
            <div class="stat-number">${clients.size}</div>
            <div class="stat-label">在线用户</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${bubbles.length}</div>
            <div class="stat-label">活跃气泡</div>
          </div>
        </div>
        
        <div class="info">
          <div class="info-item">
            <span class="label">WebSocket:</span><br>
            wss://${req.get('host')}
          </div>
          <div class="info-item">
            <span class="label">HTTP API:</span><br>
            https://${req.get('host')}
          </div>
          <div class="info-item">
            <span class="label">服务器时间:</span><br>
            ${new Date().toLocaleString('zh-CN', { 
              timeZone: 'Asia/Shanghai',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
        </div>
      </div>
      
      <script>
        // 每30秒刷新一次页面数据
        setTimeout(() => location.reload(), 30000);
      </script>
    </body>
    </html>
  `);
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    online: clients.size,
    bubbles: bubbles.length,
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API: 获取在线用户
app.get('/api/users', (req, res) => {
  const users = Array.from(clients.values()).map(c => ({
    id: c.user.id,
    nickname: c.user.nickname,
    status: c.user.status,
    joinTime: c.joinTime
  }));
  res.json(users);
});

// API: 获取气泡列表
app.get('/api/bubbles', (req, res) => {
  res.json(bubbles);
});

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log('✅ 新连接:', clientIp);
  
  let userId = null;
  let heartbeatInterval = null;
  
  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    message: '已连接到 Railway 服务器',
    serverTime: new Date().toISOString()
  }));
  
  // 心跳检测
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // 用户加入
      if (data.type === 'userJoin') {
        userId = data.user.id;
        clients.set(userId, { 
          ws, 
          user: data.user,
          joinTime: Date.now(),
          lastActive: Date.now()
        });
        
        console.log(`👤 ${data.user.nickname} (${userId}) 加入, 在线: ${clients.size}`);
        
        // 广播在线人数
        broadcast({ 
          type: 'onlineCount', 
          count: clients.size 
        });
        
        // 发送在线用户列表
        const onlineUsers = Array.from(clients.values()).map(c => ({
          id: c.user.id,
          nickname: c.user.nickname,
          avatar: c.user.avatar,
          status: c.user.status
        }));
        
        ws.send(JSON.stringify({
          type: 'onlineUsers',
          users: onlineUsers
        }));
        
        // 发送现有气泡
        ws.send(JSON.stringify({
          type: 'existingBubbles',
          bubbles: bubbles
        }));
      }
      
      // 私聊消息
      else if (data.type === 'privateMessage') {
        const targetId = data.message.toId;
        const targetClient = clients.get(targetId);
        
        console.log(`💬 ${data.message.fromName} -> ${data.message.toName}`);
        
        if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: 'privateMessage',
            message: data.message
          }));
          
          // 发送成功回执给发送者
          ws.send(JSON.stringify({
            type: 'messageSent',
            messageId: data.message.id
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'messageError',
            error: '对方不在线',
            messageId: data.message.id
          }));
        }
      }
      
      // 发布气泡
      else if (data.type === 'newBubble') {
        bubbles.push(data.bubble);
        console.log(`🎈 新气泡: ${data.bubble.title} (共${bubbles.length}个)`);
        
        // 广播给所有人
        broadcast({
          type: 'newBubble',
          bubble: data.bubble
        });
        
        // 气泡过期自动删除
        if (!data.bubble.isPrivate && data.bubble.duration) {
          setTimeout(() => {
            const index = bubbles.findIndex(b => b.id === data.bubble.id);
            if (index > -1) {
              bubbles.splice(index, 1);
              broadcast({
                type: 'bubbleExpired',
                bubbleId: data.bubble.id
              });
              console.log(`🗑️ 气泡过期: ${data.bubble.title}`);
            }
          }, data.bubble.duration * 1000);
        }
      }
      
      // 位置更新
      else if (data.type === 'updatePosition') {
        if (userId && clients.has(userId)) {
          clients.get(userId).user.position = data.position;
          clients.get(userId).lastActive = Date.now();
          
          broadcast({
            type: 'userPositionUpdate',
            userId: userId,
            position: data.position
          }, userId);
        }
      }
      
      // 心跳
      else if (data.type === 'ping') {
        ws.send(JSON.stringify({ 
          type: 'pong',
          serverTime: Date.now()
        }));
      }
      
      // 更新最后活跃时间
      if (userId && clients.has(userId)) {
        clients.get(userId).lastActive = Date.now();
      }
      
    } catch (error) {
      console.error('❌ 消息处理错误:', error.message);
    }
  });
  
  ws.on('close', () => {
    clearInterval(heartbeatInterval);
    
    if (userId) {
      const user = clients.get(userId);
      clients.delete(userId);
      
      console.log(`👋 ${user ? user.user.nickname : userId} 离开, 剩余: ${clients.size}`);
      
      broadcast({ 
        type: 'onlineCount', 
        count: clients.size 
      });
      
      broadcast({
        type: 'userLeft',
        userId: userId
      });
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error.message);
  });
  
  ws.on('pong', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).lastActive = Date.now();
    }
  });
});

// 广播消息
function broadcast(data, excludeUserId = null) {
  const message = JSON.stringify(data);
  let sent = 0;
  
  clients.forEach((client, id) => {
    if (id !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(message);
        sent++;
      } catch (error) {
        console.error(`发送失败 ${id}:`, error.message);
      }
    }
  });
  
  if (sent > 0 && data.type !== 'pong') {
    console.log(`📢 广播 ${data.type} 给 ${sent} 人`);
  }
}

// 清理不活跃连接
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5分钟
  
  clients.forEach((client, userId) => {
    if (now - client.lastActive > timeout) {
      console.log(`🧹 清理不活跃用户: ${userId}`);
      client.ws.close();
      clients.delete(userId);
    }
  });
  
  // 清理过期气泡
  const expiredBubbles = bubbles.filter(b => {
    if (b.isPrivate) return false;
    return now - b.createdAt > (b.duration * 1000);
  });
  
  expiredBubbles.forEach(b => {
    const index = bubbles.findIndex(bubble => bubble.id === b.id);
    if (index > -1) {
      bubbles.splice(index, 1);
    }
  });
  
  if (expiredBubbles.length > 0) {
    console.log(`🧹 清理过期气泡: ${expiredBubbles.length} 个`);
  }
}, 60000); // 每分钟检查一次

// 启动服务器
const PORT = parseInt(process.env.PORT) || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════');
  console.log('🚀 此刻地图服务器启动成功！');
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`📡 环境端口: ${process.env.PORT}`);
  console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`🌍 运行环境: ${process.env.NODE_ENV || 'production'}`);
  console.log(`🇨🇳 部署平台: Zeabur`);
  console.log('═══════════════════════════════════════');
});

  console.log('🚀 此刻地图服务器启动成功!');
  console.log(`📡 端口: ${PORT}`);
  console.log(`⏰ 时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'production'}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('📴 收到关闭信号...');
  
  // 通知所有客户端
  broadcast({
    type: 'serverShutdown',
    message: '服务器即将重启'
  });
  
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
