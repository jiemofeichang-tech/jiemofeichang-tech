#!/bin/bash
set -e

echo "========================================="
echo "  聚给力 - 一键部署脚本"
echo "========================================="

# 1. Fix SSH
echo "[1/7] 修复 SSH 配置..."
sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
iptables -F 2>/dev/null || true
systemctl restart sshd
echo "SSH OK"

# 2. Install system deps
echo "[2/7] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq curl git python3 python3-pip

# 3. Install Node.js 20
echo "[3/7] 安装 Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

# 4. Install PM2
echo "[4/7] 安装 PM2..."
npm install -g pm2 --silent

# 5. Clone project
echo "[5/7] 拉取项目..."
cd /root
if [ -d "jiemofeichang-tech" ]; then
    cd jiemofeichang-tech
    git pull origin main
else
    git clone https://github.com/jiemofeichang-tech/jiemofeichang-tech.git
    cd jiemofeichang-tech
fi

# 6. Install deps
echo "[6/7] 安装项目依赖..."
npm install --silent
pip3 install pymysql Pillow --quiet 2>/dev/null || pip install pymysql Pillow --quiet

# Write config
cat > .local-secrets.json << 'SECRETS'
{
  "api_key": "",
  "user_id": "",
  "default_model": "doubao-seedance-2.0",
  "auto_save": true,
  "use_file_auth": true,
  "gemini_api_key": "AIzaSyA65SVqtKB9hzVYXGJCBPllVqPI7oiU0eg",
  "ai_image_model": "gemini-2.5-flash-image",
  "ai_image_base": "https://api.ycapis.com/v1beta",
  "ai_chat_base": "http://peiqian.icu/v1/chat/completions",
  "ai_chat_model": "claude-sonnet-4-20250514",
  "ai_chat_key": "sk-firstapi-d225fca83bc948b1a480",
  "oai_image_model": "",
  "oai_image_base": "",
  "oai_image_key": "",
  "ai_image_key": ""
}
SECRETS

# Build frontend
echo "[7/7] 构建前端..."
npm run build

# Start services with PM2
pm2 delete all 2>/dev/null || true
pm2 start "python3 server.py" --name backend --cwd /root/jiemofeichang-tech
pm2 start "npx next start -p 3001 -H 0.0.0.0" --name frontend --cwd /root/jiemofeichang-tech
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Open firewall
ufw allow 3001 2>/dev/null || true
ufw allow 8787 2>/dev/null || true
iptables -I INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 8787 -j ACCEPT 2>/dev/null || true

echo ""
echo "========================================="
echo "  部署完成!"
echo "  访问: http://89.208.251.2:3001"
echo "  账号: test / test123"
echo "========================================="
