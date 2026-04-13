#!/bin/bash

# ZeroClaw Web Chat 启动脚本

echo "🚀 启动 ZeroClaw Web Chat..."
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件，使用默认配置"
    echo "💡 可以复制 .env.example 并修改配置"
    echo ""
fi

# 启动服务器
echo "📍 访问地址: http://localhost:3000"
echo "🔗 按 Ctrl+C 停止服务器"
echo ""

npm start
