# 采购跟单进度系统

参考 `pinzhiyanhuo` 的 Vite + React 页面框架搭建，当前版本支持 GitHub Pages 静态运行，业务数据保存在浏览器本地存储。

## 功能模块

- 采购总览：按供应商、产品线、采购组、状态筛选，查看关键指标和风险明细。
- 跟单台账：维护采购订单、物料、供应商、计划日期、交付数量和异常备注。
- 供应商交付：聚焦未交付明细，支持导出当前筛选结果。
- 异常跟进：自动汇总逾期、缺口和风险记录。
- 维度表库：上传商品分类、供应商、采购分组等维表，按物料编码补充台账字段。
- 事实表库：上传采购跟单事实表并应用到台账。
- 权限管理：管理员维护用户可访问页面。

## 本地开发

```bash
npm install
npm run dev
```

## GitHub Pages

推送到 `main` 后，GitHub Actions 会构建 `dist` 并发布到：

```text
https://sunlizhu521-alt.github.io/gendanjindu/
```

## 腾讯云自动部署

仓库已包含腾讯云 SSH 自动部署 workflow：

```text
.github/workflows/deploy-tencent.yml
```

服务器、Nginx 和 GitHub Secrets 配置见 [DEPLOY_TENCENT.md](./DEPLOY_TENCENT.md)。

## 默认账号

- 孙立柱 / 521sunlizhu / 管理员

GitHub Pages 预览适合演示和单机使用；多人正式协作建议后续接入服务器 API。
