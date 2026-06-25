# 腾讯云自动部署

本项目是 Vite + React 静态前端。推荐部署方式是：GitHub Actions 在每次推送 `main` 后构建 `dist`，再通过 SSH 上传到腾讯云服务器的 Nginx 静态目录。

线上路径默认按 `https://你的域名/gendanjindu/` 设计，和 `vite.config.js` 的 `base: '/gendanjindu/'` 保持一致。

## 1. 服务器准备

登录腾讯云服务器：

```bash
ssh root@你的服务器IP
```

安装 Nginx：

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

创建站点目录：

```bash
sudo mkdir -p /www/wwwroot/gendanjindu
sudo chown -R $USER:$USER /www/wwwroot/gendanjindu
```

如果 GitHub Actions 使用的 SSH 用户不是 `root`，确保该用户能写入目录：

```bash
sudo chown -R 部署用户名:部署用户名 /www/wwwroot/gendanjindu
```

## 2. Nginx 配置

新建配置：

```bash
sudo nano /etc/nginx/conf.d/gendanjindu.conf
```

写入以下内容，把 `你的域名或服务器IP` 替换为实际值：

```nginx
server {
  listen 80;
  server_name 你的域名或服务器IP;

  location /gendanjindu/ {
    root /www/wwwroot;
    try_files $uri $uri/ /gendanjindu/index.html;
  }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```text
http://你的域名或服务器IP/gendanjindu/
```

## 3. SSH Key

在本机生成一把部署专用密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-gendanjindu" -f gendanjindu_deploy_key
```

把公钥加入腾讯云服务器部署用户的 `authorized_keys`：

```bash
cat gendanjindu_deploy_key.pub
```

复制输出内容，在服务器执行：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

测试连接：

```bash
ssh -i gendanjindu_deploy_key 部署用户名@你的服务器IP
```

## 4. GitHub Secrets

进入仓库：

```text
https://github.com/sunlizhu521-alt/gendanjindu/settings/secrets/actions
```

新增这些 Repository secrets：

```text
TENCENT_HOST=你的服务器IP或域名
TENCENT_USER=部署用户名
TENCENT_PORT=22
TENCENT_DEPLOY_PATH=/www/wwwroot/gendanjindu
TENCENT_SSH_KEY=gendanjindu_deploy_key 私钥全文
```

`TENCENT_SSH_KEY` 必须粘贴私钥全文，包括：

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

## 5. 自动部署

配置完成后，每次推送到 `main` 都会触发：

```text
.github/workflows/deploy-tencent.yml
```

也可以在 GitHub 页面手动运行：

```text
Actions -> Deploy Tencent Cloud -> Run workflow
```

部署成功后访问：

```text
http://你的域名或服务器IP/gendanjindu/
```

## 6. 常见问题

- `Missing secret`：GitHub Secrets 没配完整。
- `Permission denied`：服务器没有加入正确公钥，或 `TENCENT_USER` 写错。
- `Permission denied` 写目录：部署用户没有 `/www/wwwroot/gendanjindu` 写权限。
- 页面空白：确认访问路径是 `/gendanjindu/`，并确认 Nginx 配置里的 `location /gendanjindu/` 生效。
- 404：执行 `sudo nginx -t`，确认配置已 `reload`。
