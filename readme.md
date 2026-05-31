![banner.jpg](image%2Fbanner.jpg)
# AirPod Teardown Study

 AirPod 拆解页面 。

## 功能

- 全屏视频演示
- 鼠标滚轮控制进度
- 正向/反向滚动分别播放正序和倒序视频
- 右侧竖向进度条
- 手机端适配

## 技术栈

- React
- Vite
- Framer Motion
- Lucide React

## 关键文件

- `src/App.jsx`: 页面逻辑、滚轮进度与视频切换
- `src/styles.css`: 视觉样式与响应式布局
- `public/teardown-airpod.mp4`: 正序视频
- `public/teardown-airpod-reverse.mp4`: 倒序视频
- `public/teardown-poster.jpg`: 首帧兜底图

## 开发

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173/`

## 构建

```bash
npm run build
```

输出目录：`docs/`

## 部署

项目配置为子路径部署：

```js
base: "/"
```

将 `docs/` 目录内容部署到服务器 `/` 路径下即可。
