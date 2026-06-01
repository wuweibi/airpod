![banner.jpg](image%2Fbanner.jpg)
# AirPod Teardown Study

 AirPod 拆解页面 。

DEMO（默认情况根据网络判断加载大文件还是小文件）: 
- 高清：[http://airpod.pxzh.cn/?video=main](http://airpod.pxzh.cn/?video=main)
- 普清：[http://airpod.pxzh.cn/?video=mini](http://airpod.pxzh.cn/?video=mini)


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

## 特殊操作
并且探测完成前不会开始视频预加载，避免一上来就误加载大文件。
另外给了强制开关，方便你验证：

- ?video=mini 强制走 public/mini
- ?video=main 强制走 public 主视频
